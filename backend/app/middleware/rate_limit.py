"""
Rate limiting middleware
"""
import time
from typing import Dict
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.cache_service import cache_service


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware for rate limiting API requests"""
    
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/"]:
            return await call_next(request)
        
        # Get client identifier (IP or user ID)
        client_id = self._get_client_id(request)
        
        # Check rate limit
        if not self._check_rate_limit(client_id):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {self.requests_per_minute} requests per minute."
            )
        
        return await call_next(request)
    
    def _get_client_id(self, request: Request) -> str:
        """Get client identifier for rate limiting"""
        # Try to get user ID from token
        # For now, use IP address
        client_ip = request.client.host if request.client else "unknown"
        return f"rate_limit:{client_ip}"
    
    def _check_rate_limit(self, client_id: str) -> bool:
        """Check if client has exceeded rate limit"""
        if not cache_service.enabled:
            return True  # If Redis is not available, skip rate limiting
        
        # Get current request count
        current_count = cache_service.get(client_id)
        if current_count is None:
            # First request in this minute
            cache_service.set(client_id, 1, ttl=60)
            return True
        
        if current_count >= self.requests_per_minute:
            return False
        
        # Increment count
        cache_service.set(client_id, current_count + 1, ttl=60)
        return True



