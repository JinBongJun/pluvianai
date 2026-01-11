"""
API Hook middleware for capturing LLM API requests/responses
Optimized for high throughput with async background tasks
"""
import time
import json
import asyncio
from typing import Optional
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse, JSONResponse
from app.services.data_normalizer import DataNormalizer
from app.services.background_tasks import background_task_service


class APIHookMiddleware(BaseHTTPMiddleware):
    """Middleware to capture and log LLM API calls"""
    
    def __init__(self, app, enabled: bool = True):
        super().__init__(app)
        self.enabled = enabled
        self.normalizer = DataNormalizer()
    
    async def dispatch(self, request: Request, call_next):
        # Only process LLM API proxy requests
        if not self.enabled or not request.url.path.startswith("/api/v1/proxy/"):
            return await call_next(request)
        
        # Extract project ID from headers or query params
        project_id = request.headers.get("X-Project-ID")
        if not project_id:
            # Try to get from query params
            project_id = request.query_params.get("project_id")
        
        if not project_id:
            # If no project ID, pass through without logging
            return await call_next(request)
        
        try:
            project_id = int(project_id)
        except (ValueError, TypeError):
            return await call_next(request)
        
        # Capture request
        request_body = await request.body()
        request_data = None
        if request_body:
            try:
                request_data = json.loads(request_body)
            except json.JSONDecodeError:
                request_data = {"raw": request_body.decode("utf-8", errors="ignore")}
        
        # Record start time
        start_time = time.time()
        
        # Process request
        response = await call_next(request)
        
        # Calculate latency
        latency_ms = (time.time() - start_time) * 1000
        
        # Capture response
        response_body = b""
        if isinstance(response, StreamingResponse):
            # For streaming responses, we need to capture the stream
            async def generate():
                async for chunk in response.body_iterator:
                    yield chunk
                    nonlocal response_body
                    response_body += chunk
            
            response = StreamingResponse(
                generate(),
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
        else:
            response_body = getattr(response, "body", b"")
        
        # Parse response
        response_data = None
        response_text = None
        if response_body:
            try:
                response_data = json.loads(response_body)
                response_text = json.dumps(response_data)
            except json.JSONDecodeError:
                response_text = response_body.decode("utf-8", errors="ignore")
                response_data = {"raw": response_text}
        
        # Normalize and extract data
        normalized = self.normalizer.normalize(
            request_data=request_data,
            response_data=response_data,
            url=str(request.url)
        )
        
        # Save to database asynchronously in background (non-blocking)
        # This prevents blocking the API response
        status_code = response.status_code if hasattr(response, "status_code") else 200
        agent_name = request.headers.get("X-Agent-Name")
        chain_id = request.headers.get("X-Chain-ID")
        
        # Get API key for Shadow Routing
        api_key = None
        auth_header = request.headers.get("Authorization")
        if auth_header:
            api_key = auth_header.replace("Bearer ", "").replace("Api-Key ", "")
        
        # Fire and forget - don't wait for completion
        try:
            asyncio.create_task(
                background_task_service.save_api_call_async(
                    project_id=project_id,
                    request_data=request_data or {},
                    response_data=response_data or {},
                    normalized=normalized,
                    latency_ms=latency_ms,
                    status_code=status_code,
                    agent_name=agent_name,
                    chain_id=chain_id,
                    api_key=api_key
                )
            )
        except Exception as e:
            # Log error but don't fail the request
            from app.core.logging_config import logger
            logger.error(f"Error scheduling API call save: {e}")
        
        return response


