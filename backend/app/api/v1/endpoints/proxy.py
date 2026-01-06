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

router = APIRouter()

# Provider base URLs
PROVIDER_URLS = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "google": "https://generativelanguage.googleapis.com/v1",
}


@router.api_route("/{provider}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_request(
    provider: str,
    path: str,
    request: Request,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_agent_name: Optional[str] = Header(None, alias="X-Agent-Name"),
    x_chain_id: Optional[str] = Header(None, alias="X-Chain-ID"),
    db: Session = Depends(get_db)
):
    """
    Proxy LLM API requests to the actual provider
    
    This endpoint forwards requests to OpenAI, Anthropic, or Google APIs
    while capturing the request/response for monitoring.
    """
    if provider not in PROVIDER_URLS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}"
        )
    
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
                        detail=error_msg or "API call limit exceeded. Please upgrade your plan."
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"API key required for {provider}"
        )
    
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
    
    # Forward request
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                params=dict(request.query_params)
            )
            
            # Return response
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.headers.get("content-type")
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Request timeout"
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Proxy error: {str(e)}"
            )



