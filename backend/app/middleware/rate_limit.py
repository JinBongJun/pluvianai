"""
Rate limiting middleware.
Uses Redis when available; falls back to in-memory per-process limits when Redis is disabled.
"""

import time
from typing import Dict, Tuple
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.cache_service import cache_service

# In-memory fallback when Redis is unavailable: client_id -> (count, window_end_ts)
_memory_rate: Dict[str, Tuple[int, float]] = {}
_MEMORY_WINDOW_SEC = 60


def _prune_memory_rate() -> None:
    """Remove expired entries from in-memory rate store."""
    now = time.time()
    expired = [k for k, (_, end) in _memory_rate.items() if end <= now]
    for k in expired:
        del _memory_rate[k]


def _check_rate_limit_memory(client_id: str, limit: int) -> bool:
    """Rate limit using in-memory store (fallback when Redis is disabled)."""
    _prune_memory_rate()
    now = time.time()
    if client_id not in _memory_rate:
        _memory_rate[client_id] = (1, now + _MEMORY_WINDOW_SEC)
        return True
    count, window_end = _memory_rate[client_id]
    if window_end <= now:
        _memory_rate[client_id] = (1, now + _MEMORY_WINDOW_SEC)
        return True
    if count >= limit:
        return False
    _memory_rate[client_id] = (count + 1, window_end)
    return True


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware for rate limiting API requests"""

    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks and OPTIONS requests (CORS preflight)
        if request.url.path in ["/health", "/"] or request.method == "OPTIONS":
            return await call_next(request)

        # Get client identifier (IP or user ID)
        client_id = self._get_client_id(request)

        # Check rate limit
        if not self._check_rate_limit(client_id):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {self.requests_per_minute} requests per minute.",
            )

        return await call_next(request)

    def _get_client_id(self, request: Request) -> str:
        """Get client identifier for rate limiting"""
        # Try to get user ID from token
        # For now, use IP address
        client_ip = request.client.host if request.client else "unknown"
        return f"rate_limit:{client_ip}"

    def _check_rate_limit(self, client_id: str) -> bool:
        """Check if client has exceeded rate limit. Uses Redis when enabled; in-memory fallback otherwise."""
        if cache_service.enabled:
            current_count = cache_service.get(client_id)
            if current_count is None:
                cache_service.set(client_id, 1, ttl=60)
                return True
            if current_count >= self.requests_per_minute:
                return False
            cache_service.set(client_id, current_count + 1, ttl=60)
            return True
        return _check_rate_limit_memory(client_id, self.requests_per_minute)
