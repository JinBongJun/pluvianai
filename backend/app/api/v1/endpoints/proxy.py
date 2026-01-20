"""
Proxy endpoints for forwarding LLM API requests
"""

import httpx
from fastapi import APIRouter, Request, Response, HTTPException, status, Header, Depends
from typing import Optional
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.models.project import Project
from app.services.subscription_service import SubscriptionService
from app.middleware.usage_middleware import check_api_call_limit
from app.utils.retry import async_retry
from app.utils.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from app.utils.bulkhead import Bulkhead
from app.core.metrics import (
    retry_attempts_total,
    circuit_breaker_open_total,
    circuit_breaker_state,
)

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
    x_project_id: Optional[str],
    x_agent_name: Optional[str],
    x_chain_id: Optional[str],
    db: Session,
) -> Response:
    """
    Core proxy implementation shared by all HTTP methods.
    Defined separately so that each method-specific route can have a unique
    function name / operation_id in the OpenAPI schema.
    """
    if provider not in PROVIDER_URLS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported provider: {provider}")

    # Check usage limit if project ID is provided
    if x_project_id:
        try:
            project_id = int(x_project_id)
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                # Check API call limit before processing
                can_make_call, error_msg = check_api_call_limit(project.owner_id, db)
                if not can_make_call:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=error_msg or "API call limit exceeded. Please upgrade your plan.",
                    )
        except (ValueError, TypeError):
            # Invalid project ID, continue without limit check
            pass

    # Build target URL
    base_url = PROVIDER_URLS[provider]
    target_url = f"{base_url}/{path}"

    # Get request body
    body = await request.body()

    # Get API key from headers or settings
    api_key = None
    auth_header = request.headers.get("Authorization")
    if auth_header:
        api_key = auth_header.replace("Bearer ", "").replace("Api-Key ", "")
    else:
        # Fallback to settings
        if provider == "openai" and settings.OPENAI_API_KEY:
            api_key = settings.OPENAI_API_KEY
        elif provider == "anthropic" and settings.ANTHROPIC_API_KEY:
            api_key = settings.ANTHROPIC_API_KEY
        elif provider == "google" and settings.GOOGLE_API_KEY:
            api_key = settings.GOOGLE_API_KEY

    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"API key required for {provider}")

    # Prepare headers
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    # Set provider-specific auth headers
    if provider == "openai":
        headers["Authorization"] = f"Bearer {api_key}"
    elif provider == "anthropic":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = headers.get("anthropic-version", "2023-06-01")
    elif provider == "google":
        headers["x-goog-api-key"] = api_key

    # Forward request with bulkhead + circuit breaker + retry
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
                # Update breaker state metric
                circuit_breaker_state.labels(service="proxy").set(
                    {"closed": 0, "open": 1, "half-open": 2}.get(_breaker.state, 0)
                )
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.headers.get("content-type"),
                )
            except CircuitBreakerOpen:
                circuit_breaker_open_total.labels(service="proxy").inc()
                circuit_breaker_state.labels(service="proxy").set(1)
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Upstream temporarily unavailable (circuit open)",
                )
            except httpx.TimeoutException as e:
                last_error = e
                retry_attempts_total.labels(service="proxy").inc()
                if attempt == 2:
                    raise HTTPException(
                        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                        detail="Request timeout",
                    )
            except httpx.RequestError as e:
                last_error = e
                retry_attempts_total.labels(service="proxy").inc()
                if attempt == 2:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Proxy error: {str(e)}",
                    )
        # If all retries failed
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Proxy failed after retries" if last_error else "Proxy failed",
        )


@router.get("/{provider}/{path:path}")
async def proxy_get(
    provider: str,
    path: str,
    request: Request,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, x_project_id, x_agent_name, x_chain_id, db)


@router.post("/{provider}/{path:path}")
async def proxy_post(
    provider: str,
    path: str,
    request: Request,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, x_project_id, x_agent_name, x_chain_id, db)


@router.put("/{provider}/{path:path}")
async def proxy_put(
    provider: str,
    path: str,
    request: Request,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, x_project_id, x_agent_name, x_chain_id, db)


@router.patch("/{provider}/{path:path}")
async def proxy_patch(
    provider: str,
    path: str,
    request: Request,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, x_project_id, x_agent_name, x_chain_id, db)


@router.delete("/{provider}/{path:path}")
async def proxy_delete(
    provider: str,
    path: str,
    request: Request,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db),
) -> Response:
    return await _proxy_request(provider, path, request, x_project_id, x_agent_name, x_chain_id, db)
