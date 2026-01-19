"""
Metrics middleware for Prometheus
"""
import time
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse
from app.core.metrics import (
    api_requests_total,
    api_request_duration_seconds,
    api_request_size_bytes,
    api_response_size_bytes,
    errors_total
)
import re


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware to collect Prometheus metrics"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip metrics endpoint to avoid recursion
        if request.url.path == "/metrics":
            return await call_next(request)
        
        method = request.method
        path = self._normalize_path(request.url.path)
        
        # Record request size
        request_size = 0
        if hasattr(request, '_body'):
            request_size = len(request._body) if request._body else 0
        
        start_time = time.time()
        status_code = 200
        
        try:
            response = await call_next(request)
            
            # Get status code
            if hasattr(response, 'status_code'):
                status_code = response.status_code
            
            # Record response size
            response_size = 0
            if hasattr(response, 'body'):
                response_size = len(response.body) if response.body else 0
            
            duration = time.time() - start_time
            
            # Record metrics
            api_requests_total.labels(
                method=method,
                endpoint=path,
                status_code=str(status_code)
            ).inc()
            
            api_request_duration_seconds.labels(
                method=method,
                endpoint=path
            ).observe(duration)
            
            if request_size > 0:
                api_request_size_bytes.labels(
                    method=method,
                    endpoint=path
                ).observe(request_size)
            
            if response_size > 0:
                api_response_size_bytes.labels(
                    method=method,
                    endpoint=path
                ).observe(response_size)
            
            return response
            
        except Exception as e:
            duration = time.time() - start_time
            status_code = 500
            
            # Record error
            errors_total.labels(
                type=type(e).__name__,
                endpoint=path
            ).inc()
            
            # Record failed request
            api_requests_total.labels(
                method=method,
                endpoint=path,
                status_code=str(status_code)
            ).inc()
            
            api_request_duration_seconds.labels(
                method=method,
                endpoint=path
            ).observe(duration)
            
            raise
    
    def _normalize_path(self, path: str) -> str:
        """Normalize path by replacing IDs with placeholders"""
        # Replace UUIDs
        path = re.sub(
            r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            '{id}',
            path,
            flags=re.IGNORECASE
        )
        # Replace numeric IDs
        path = re.sub(r'/\d+', '/{id}', path)
        return path
