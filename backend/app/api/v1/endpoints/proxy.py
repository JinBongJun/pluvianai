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
from app.models.project import Project
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


async def _stream_with_firewall(
    response: httpx.Response,
    project_id: int,
    rules: list,
    resp_headers: dict,
    trace_id: str
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
    db: Session,
) -> Response:
    """
    Core proxy implementation shared by all HTTP methods.
    """
    if provider not in PROVIDER_URLS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported provider: {provider}")

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
    if x_project_id:
        try:
            project_id = int(x_project_id)
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                can_make_call, error_msg = check_api_call_limit(project.owner_id, db)
                if not can_make_call:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=error_msg or "API call limit exceeded. Please upgrade your plan.",
                    )
        except (ValueError, TypeError):
            pass

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

    # 1. Capture Snapshot (Non-blocking Background Task)
    trace_id = x_chain_id or str(uuid.uuid4())
    
    if x_project_id and request.method == "POST":
        try:
            # Parse body to JSON to capture context
            payload = json.loads(body)
            if isinstance(payload, dict) and x_agent_name:
                # Header-based agent name has highest priority for proxy traffic.
                payload.setdefault("agent_id", x_agent_name)
                payload.setdefault("agent_name", x_agent_name)
            
            # Sub-task to handle snapshot (async buffering via Redis Stream)
            def bg_snapshot(p_id: int, t_id: str, prov: str, mod: str, pay: Dict):
                with SessionLocal() as bg_db:
                    try:
                        from app.services.snapshot_service import SnapshotService
                        from app.infrastructure.repositories.trace_repository import TraceRepository
                        from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
                        
                        # Create service instance for background task
                        trace_repo = TraceRepository(bg_db)
                        snapshot_repo = SnapshotRepository(bg_db)
                        bg_snapshot_service = SnapshotService(trace_repo, snapshot_repo, bg_db)
                        
                        # Create trace first
                        bg_snapshot_service.create_trace(p_id, t_id)
                        
                        # Save snapshot (will use Redis Stream if available, fail-silent if not)
                        result = bg_snapshot_service.save_snapshot(t_id, prov, mod, pay, project_id=p_id)
                        
                        # Only commit if snapshot was saved directly (fallback mode)
                        if result is not None:
                            bg_db.commit()
                        # If result is None, snapshot was queued to Redis Stream (async)
                    except Exception as ex:
                        logger.warning(f"Background snapshot error (fail-silent): {str(ex)}")
                        bg_db.rollback()

            background_tasks.add_task(
                bg_snapshot, 
                int(x_project_id), 
                trace_id, 
                provider, 
                payload.get("model", "unknown"), 
                payload
            )
        except Exception as e:
            logger.warning(f"Failed to queue snapshot for trace {trace_id}: {str(e)}")

    # Auth handling
    api_key = None
    auth_header = request.headers.get("Authorization")
    if auth_header:
        api_key = auth_header.replace("Bearer ", "").replace("Api-Key ", "")
    else:
        if provider == "openai" and settings.OPENAI_API_KEY:
            api_key = settings.OPENAI_API_KEY
        elif provider == "anthropic" and settings.ANTHROPIC_API_KEY:
            api_key = settings.ANTHROPIC_API_KEY
        elif provider == "google" and settings.GOOGLE_API_KEY:
            api_key = settings.GOOGLE_API_KEY

    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"API key required for {provider}")

    # Headers preparation
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)
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
                                trace_id
                            )
                    except (ValueError, TypeError):
                        pass
                    except Exception as e:
                        logger.warning(f"Firewall check failed: {str(e)}")
                
                # Non-streaming or no firewall rules: return as-is
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
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, background_tasks, x_project_id, x_agent_name, x_chain_id, db)


@router.post("/{provider}/{path:path}")
async def proxy_post(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, background_tasks, x_project_id, x_agent_name, x_chain_id, db)


@router.put("/{provider}/{path:path}")
async def proxy_put(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, background_tasks, x_project_id, x_agent_name, x_chain_id, db)


@router.patch("/{provider}/{path:path}")
async def proxy_patch(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, background_tasks, x_project_id, x_agent_name, x_chain_id, db)


@router.delete("/{provider}/{path:path}")
async def proxy_delete(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, background_tasks, x_project_id, x_agent_name, x_chain_id, db)
