"""
Proxy endpoints for forwarding LLM API requests
"""

import json
import uuid
import httpx
from fastapi import APIRouter, Request, Response, HTTPException, status, Header, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Optional, Dict
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.core.permissions import check_project_access
from app.core.security import get_current_user_or_api_key
from app.models.project import Project
from app.models.user import User
from app.services.cache_service import cache_service
from app.services.firewall_service import firewall_service
from app.core.dependencies import get_snapshot_service
from app.middleware.usage_middleware import check_api_call_limit
from app.utils.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from app.utils.bulkhead import Bulkhead
from app.core.metrics import (
    retry_attempts_total,
    circuit_breaker_open_total,
    circuit_breaker_state,
)
from app.core.logging_config import logger

router = APIRouter()

# Provider base URLs
PROVIDER_URLS = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "google": "https://generativelanguage.googleapis.com/v1",
}

_breaker = CircuitBreaker(failure_threshold=5, recovery_time_seconds=30, exception_types=(httpx.RequestError,))
_bulkhead = Bulkhead(max_concurrent=20)


def _get_platform_provider_key(provider: str) -> Optional[str]:
    if provider == "openai":
        return settings.OPENAI_API_KEY
    if provider == "anthropic":
        return settings.ANTHROPIC_API_KEY
    if provider == "google":
        return settings.GOOGLE_API_KEY
    return None


async def _stream_with_firewall(
    response: httpx.Response,
    project_id: int,
    rules: list,
    resp_headers: dict,
    trace_id: str,
    snapshot_provider: Optional[str] = None,
    snapshot_model: Optional[str] = None,
    snapshot_payload: Optional[Dict] = None,
) -> StreamingResponse:
    """
    Stream response with real-time firewall scanning
    
    Args:
        response: httpx response object
        project_id: Project ID
        rules: List of firewall rules
        resp_headers: Response headers to include
        trace_id: Trace ID
        
    Returns:
        StreamingResponse with firewall scanning
    """
    accumulated_text = ""
    
    def _best_effort_extract_stream_text(sse_text: str) -> str:
        """
        Best-effort extraction of assistant text from SSE/NDJSON streams.
        This is intentionally lightweight; full fidelity is not required for baseline comparison.
        """
        if not isinstance(sse_text, str) or not sse_text.strip():
            return ""
        out_parts = []
        # SSE format: lines like "data: {json}\n\n"
        for raw_line in sse_text.splitlines():
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            data = line[len("data:") :].strip()
            if not data or data == "[DONE]":
                continue
            try:
                obj = json.loads(data)
            except Exception:
                continue
            # OpenAI chat.completions stream: choices[].delta.content
            try:
                choices = obj.get("choices")
                if isinstance(choices, list) and choices:
                    delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
                    if isinstance(delta, dict):
                        c = delta.get("content")
                        if isinstance(c, str) and c:
                            out_parts.append(c)
            except Exception:
                pass
            # OpenAI Responses API stream (best-effort): "delta" fields may differ; ignore for now
        text = "".join(out_parts).strip()
        return text

    async def generate():
        nonlocal accumulated_text
        async for chunk_bytes in response.aiter_bytes():
            try:
                # Decode chunk
                chunk = chunk_bytes.decode("utf-8", errors="ignore")
                accumulated_text += chunk
                
                # Scan chunk with firewall
                scan_result = await firewall_service.scan_streaming_response(
                    response_chunk=chunk,
                    project_id=project_id,
                    rules=rules,
                    accumulated_text=accumulated_text
                )
                
                # If blocked, stop streaming and return error
                if scan_result.get("blocked"):
                    logger.warning(
                        f"Firewall blocked response for project {project_id}: "
                        f"{scan_result.get('reason')} (rule: {scan_result.get('rule_id')})"
                    )
                    # Return error JSON instead of continuing stream
                    error_response = {
                        "error": {
                            "message": f"Pluvian Sentinel Firewall: {scan_result.get('reason')}",
                            "type": "firewall_blocked",
                            "severity": scan_result.get("severity"),
                            "rule_id": scan_result.get("rule_id")
                        }
                    }
                    yield f"data: {json.dumps(error_response)}\n\n".encode("utf-8")
                    return
                
                # Not blocked: yield chunk as-is
                yield chunk_bytes
                
            except Exception as e:
                logger.error(f"Firewall streaming error: {str(e)}")
                # On error, continue streaming (fail-open for resilience)
                yield chunk_bytes
        # Stream finished; capture best-effort response text for snapshot baseline.
        try:
            if project_id and snapshot_payload and snapshot_provider:
                extracted = _best_effort_extract_stream_text(accumulated_text) or accumulated_text.strip()
                # Bound size to avoid huge DB rows.
                extracted = extracted[:8000] if extracted else ""
                pay = dict(snapshot_payload) if isinstance(snapshot_payload, dict) else {}
                if extracted and not pay.get("response"):
                    pay["response"] = extracted
                # Save snapshot in background (do not block stream completion).
                def bg_snapshot(p_id: int, t_id: str, prov: str, mod: str, pay_in: Dict):
                    with SessionLocal() as bg_db:
                        try:
                            from app.services.snapshot_service import SnapshotService
                            from app.infrastructure.repositories.trace_repository import TraceRepository
                            from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
                            from app.services.live_view_events import publish_agents_changed
                            trace_repo = TraceRepository(bg_db)
                            snapshot_repo = SnapshotRepository(bg_db)
                            svc = SnapshotService(trace_repo, snapshot_repo, bg_db)
                            svc.create_trace(p_id, t_id)
                            result = svc.save_snapshot(t_id, prov, mod, pay_in, project_id=p_id)
                            if result is not None:
                                bg_db.commit()
                                try:
                                    publish_agents_changed(p_id, [getattr(result, "agent_id", None)])
                                except Exception:
                                    pass
                        except Exception as ex:
                            logger.warning(f"Background snapshot error (stream capture, fail-silent): {str(ex)}")
                            bg_db.rollback()
                loop = asyncio.get_event_loop()
                loop.run_in_executor(
                    None,
                    bg_snapshot,
                    int(project_id),
                    str(trace_id),
                    str(snapshot_provider),
                    str(snapshot_model or pay.get("model", "unknown")),
                    pay,
                )
        except Exception:
            pass
    
    return StreamingResponse(
        generate(),
        status_code=response.status_code,
        headers=resp_headers,
        media_type=response.headers.get("content-type", "text/event-stream"),
    )


async def _proxy_request(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str],
    x_agent_name: Optional[str],
    x_chain_id: Optional[str],
    current_user: User,
    db: Session,
) -> Response:
    """
    Core proxy implementation shared by all HTTP methods.
    """
    if provider not in PROVIDER_URLS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported provider: {provider}")

    project: Optional[Project] = None
    project_id: Optional[int] = None
    auth_method = getattr(request.state, "auth_method", None)
    if auth_method == "api_key" and not x_project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Project-ID is required when authenticating with an API key.",
        )

    if x_project_id:
        try:
            project_id = int(x_project_id)
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Project-ID must be a valid integer.",
            ) from exc
        project = check_project_access(project_id, current_user, db)

    # 0. Panic Mode Check (High Performance via Redis)
    if x_project_id:
        try:
            if cache_service.enabled:
                is_panic = cache_service.redis_client.get(f"project:{x_project_id}:panic_mode")
                if is_panic == "1":
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Pluvian: Panic Mode Active. All traffic is blocked for safety."
                    )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Panic check failed for project {x_project_id}: {str(e)}")

    # Check usage limit if project ID is provided
    if project is not None:
        can_make_call, error_msg = check_api_call_limit(project.owner_id, db)
        if not can_make_call:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=error_msg or "API call limit exceeded. Please upgrade your plan.",
            )

    # Build target URL
    base_url = PROVIDER_URLS[provider]
    target_url = f"{base_url}/{path}"

    # SSRF Protection: Validate URL before making request
    from app.utils.ssrf_protection import validate_provider_url
    
    if not validate_provider_url(target_url, provider, PROVIDER_URLS):
        logger.error(
            f"SSRF protection blocked request to: {target_url}",
            extra={"provider": provider, "path": path, "project_id": x_project_id}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or unsafe URL. SSRF protection blocked this request."
        )

    # Get request body
    body = await request.body()

    # 1. Capture Snapshot (store request now; attach response after upstream returns)
    trace_id = x_chain_id or str(uuid.uuid4())
    snapshot_payload: Optional[Dict] = None
    snapshot_model: str = "unknown"
    
    if x_project_id and request.method == "POST":
        try:
            payload_obj = json.loads(body) if body else None
            if isinstance(payload_obj, dict):
                if x_agent_name:
                    payload_obj.setdefault("agent_id", x_agent_name)
                    payload_obj.setdefault("agent_name", x_agent_name)
                snapshot_payload = payload_obj
                snapshot_model = str(payload_obj.get("model", "unknown"))
        except Exception:
            snapshot_payload = None

    # Auth handling: route access is authenticated separately (JWT or Pluvian API key).
    # Upstream provider credentials come only from server-side settings.
    api_key = _get_platform_provider_key(provider)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Platform provider key is not configured for {provider}.",
        )

    # Headers preparation
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)
    headers.pop("Authorization", None)
    headers.pop("authorization", None)
    headers.pop("x-api-key", None)
    headers.pop("x-goog-api-key", None)
    if provider == "openai":
        headers["Authorization"] = f"Bearer {api_key}"
    elif provider == "anthropic":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = headers.get("anthropic-version", "2023-06-01")
    elif provider == "google":
        headers["x-goog-api-key"] = api_key

    # Execution with standard Proxy logic
    async with httpx.AsyncClient(timeout=60.0) as client:
        last_error = None
        for attempt in range(3):
            try:
                async with _bulkhead.acquire():
                    # Check if this is a streaming request
                    is_streaming_request = False
                    if body and request.method == "POST":
                        try:
                            payload = json.loads(body)
                            is_streaming_request = payload.get("stream", False)
                        except (json.JSONDecodeError, KeyError):
                            pass
                    
                    # Use stream=True for streaming requests to enable chunk-by-chunk processing
                    response = await _breaker.call_async(
                        client.request,
                        method=request.method,
                        url=target_url,
                        headers=headers,
                        content=body,
                        params=dict(request.query_params),
                        stream=is_streaming_request,  # Enable streaming for stream=true requests
                    )
                
                # Update metrics
                circuit_breaker_state.labels(service="proxy").set(
                    {"closed": 0, "open": 1, "half-open": 2}.get(_breaker.state, 0)
                )

                # Inject Trace-ID and Error Namespace into response
                resp_headers = dict(response.headers)
                resp_headers["X-Pluvian-Trace-ID"] = trace_id
                resp_headers["X-Pluvian-Origin"] = "Upstream"  # Response from original LLM
                
                # Check if this is a streaming response (chat completions with stream=true)
                content_type = response.headers.get("content-type", "")
                is_streaming = (
                    "text/event-stream" in content_type or
                    "application/x-ndjson" in content_type or
                    (x_project_id and request.method == "POST" and body)
                )
                
                # If streaming and project_id provided, apply firewall
                if is_streaming and x_project_id:
                    try:
                        project_id = int(x_project_id)
                        # Get firewall rules for this project
                        rules = firewall_service.get_project_firewall_rules(project_id, db)
                        
                        if rules:
                            # Stream with firewall scanning
                            return await _stream_with_firewall(
                                response,
                                project_id,
                                rules,
                                resp_headers,
                                trace_id,
                                snapshot_provider=provider,
                                snapshot_model=snapshot_model,
                                snapshot_payload=snapshot_payload,
                            )
                    except (ValueError, TypeError):
                        pass
                    except Exception as e:
                        logger.warning(f"Firewall check failed: {str(e)}")
                
                # Non-streaming or no firewall rules: capture response text and save snapshot in background.
                if x_project_id and request.method == "POST" and snapshot_payload:
                    try:
                        from app.services.data_normalizer import DataNormalizer
                        normalizer = DataNormalizer()
                        extracted_text = ""
                        try:
                            resp_json = response.json()
                            extracted_text = str(normalizer._extract_response_text(resp_json) or "").strip()
                        except Exception:
                            extracted_text = str(response.text or "").strip()
                        if extracted_text and not snapshot_payload.get("response"):
                            snapshot_payload["response"] = extracted_text[:8000]

                        def bg_snapshot(p_id: int, t_id: str, prov: str, mod: str, pay: Dict):
                            with SessionLocal() as bg_db:
                                try:
                                    from app.services.snapshot_service import SnapshotService
                                    from app.infrastructure.repositories.trace_repository import TraceRepository
                                    from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
                                    from app.services.live_view_events import publish_agents_changed
                                    trace_repo = TraceRepository(bg_db)
                                    snapshot_repo = SnapshotRepository(bg_db)
                                    svc = SnapshotService(trace_repo, snapshot_repo, bg_db)
                                    svc.create_trace(p_id, t_id)
                                    result = svc.save_snapshot(t_id, prov, mod, pay, project_id=p_id)
                                    if result is not None:
                                        bg_db.commit()
                                        try:
                                            publish_agents_changed(p_id, [getattr(result, "agent_id", None)])
                                        except Exception:
                                            pass
                                except Exception as ex:
                                    logger.warning(f"Background snapshot error (fail-silent): {str(ex)}")
                                    bg_db.rollback()

                        background_tasks.add_task(
                            bg_snapshot,
                            int(x_project_id),
                            trace_id,
                            provider,
                            snapshot_model or snapshot_payload.get("model", "unknown"),
                            snapshot_payload,
                        )
                    except Exception as e:
                        logger.warning(f"Failed to queue snapshot with response for trace {trace_id}: {str(e)}")

                # Return as-is
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    headers=resp_headers,
                    media_type=response.headers.get("content-type"),
                )
            except CircuitBreakerOpen:
                circuit_breaker_open_total.labels(service="proxy").inc()
                from fastapi.responses import JSONResponse
                error_response = JSONResponse(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    content={"error": "Upstream temporarily unavailable (circuit open)"},
                    headers={"X-Pluvian-Origin": "Proxy"},  # Pluvian proxy error
                )
                return error_response
            except httpx.RequestError as e:
                # Network error
                last_error = e
                retry_attempts_total.labels(service="proxy").inc()
                if attempt == 2:
                    from fastapi.responses import JSONResponse
                    error_response = JSONResponse(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        content={"error": str(last_error)},
                        headers={"X-Pluvian-Origin": "Network"},  # Network error
                    )
                    return error_response
            except Exception as e:
                # PluvianAI proxy error
                last_error = e
                retry_attempts_total.labels(service="proxy").inc()
                if attempt == 2:
                    from fastapi.responses import JSONResponse
                    error_response = JSONResponse(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        content={"error": str(last_error)},
                        headers={
                            "X-PluvianAI-Origin": "Proxy",
                        },
                    )
                    return error_response
        
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"error": "Proxy failed after retries"},
            headers={"X-Pluvian-Origin": "Proxy"},
        )


@router.get("/{provider}/{path:path}")
async def proxy_get(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    current_user: User = Depends(get_current_user_or_api_key),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(
        provider,
        path,
        request,
        background_tasks,
        x_project_id,
        x_agent_name,
        x_chain_id,
        current_user,
        db,
    )


@router.post("/{provider}/{path:path}")
async def proxy_post(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    current_user: User = Depends(get_current_user_or_api_key),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(
        provider,
        path,
        request,
        background_tasks,
        x_project_id,
        x_agent_name,
        x_chain_id,
        current_user,
        db,
    )


@router.put("/{provider}/{path:path}")
async def proxy_put(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    current_user: User = Depends(get_current_user_or_api_key),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(
        provider,
        path,
        request,
        background_tasks,
        x_project_id,
        x_agent_name,
        x_chain_id,
        current_user,
        db,
    )


@router.patch("/{provider}/{path:path}")
async def proxy_patch(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    current_user: User = Depends(get_current_user_or_api_key),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(
        provider,
        path,
        request,
        background_tasks,
        x_project_id,
        x_agent_name,
        x_chain_id,
        current_user,
        db,
    )


@router.delete("/{provider}/{path:path}")
async def proxy_delete(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    current_user: User = Depends(get_current_user_or_api_key),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(
        provider,
        path,
        request,
        background_tasks,
        x_project_id,
        x_agent_name,
        x_chain_id,
        current_user,
        db,
    )
