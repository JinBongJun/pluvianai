"""
Proxy endpoints for forwarding LLM API requests
"""

import json
import uuid
import httpx
from fastapi import APIRouter, Request, Response, HTTPException, status, Header, Depends, BackgroundTasks
from typing import Optional, Dict
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.models.project import Project
from app.services.cache_service import cache_service
from app.services.snapshot_service import snapshot_service
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
                        detail="AgentGuard: Panic Mode Active. All traffic is blocked for safety."
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

    # Get request body
    body = await request.body()

    # 1. Capture Snapshot (Non-blocking Background Task)
    trace_id = x_chain_id or str(uuid.uuid4())
    
    if x_project_id and request.method == "POST":
        try:
            # Parse body to JSON to capture context
            payload = json.loads(body)
            
            # Sub-task to handle DB operations in its own session
            def bg_snapshot(p_id: int, t_id: str, prov: str, mod: str, pay: Dict):
                with SessionLocal() as bg_db:
                    try:
                        snapshot_service.create_trace(bg_db, p_id, t_id)
                        snapshot_service.save_snapshot(bg_db, t_id, prov, mod, pay)
                    except Exception as ex:
                        logger.error(f"Background snapshot error: {str(ex)}")

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
                    response = await _breaker.call_async(
                        client.request,
                        method=request.method,
                        url=target_url,
                        headers=headers,
                        content=body,
                        params=dict(request.query_params),
                    )
                
                # Update metrics
                circuit_breaker_state.labels(service="proxy").set(
                    {"closed": 0, "open": 1, "half-open": 2}.get(_breaker.state, 0)
                )

                # Inject Trace-ID into response and return
                resp_headers = dict(response.headers)
                resp_headers["X-AgentGuard-Trace-ID"] = trace_id
                
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    headers=resp_headers,
                    media_type=response.headers.get("content-type"),
                )
            except CircuitBreakerOpen:
                circuit_breaker_open_total.labels(service="proxy").inc()
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Upstream temporarily unavailable (circuit open)",
                )
            except Exception as e:
                last_error = e
                retry_attempts_total.labels(service="proxy").inc()
                if attempt == 2:
                    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(last_error))
        
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Proxy failed after retries")


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
