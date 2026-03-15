"""
Rate limiting middleware.
Uses Redis when available; falls back to in-memory per-process limits when Redis is disabled.
Global limit applies to all requests; heavy endpoints have an additional per-endpoint limit.
"""

import time
from typing import Dict, Optional, Tuple
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.cache_service import cache_service

# In-memory fallback when Redis is unavailable: client_id -> (count, window_end_ts)
_memory_rate: Dict[str, Tuple[int, float]] = {}
_memory_heavy: Dict[str, Tuple[int, float]] = {}
_MEMORY_WINDOW_SEC = 60

# Heavy endpoints: (path_substring, method, limit_per_min, path_key). Longest path first.
HEAVY_ENDPOINTS: Tuple[Tuple[str, str, int, str], ...] = (
    ("release-gate/validate-async", "POST", 20, "release_gate_validate"),
    ("release-gate/validate", "POST", 20, "release_gate_validate"),
    ("quality/evaluate", "POST", 20, "quality_evaluate"),
    ("behavior/validate", "POST", 20, "behavior_validate"),
    ("behavior/compare", "POST", 20, "behavior_compare"),
)
RATE_LIMIT_INGEST_PER_MINUTE = 100
RATE_LIMIT_SNAPSHOTS_CREATE_PER_MINUTE = 10


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


def _get_heavy_limit(path: str, method: str) -> Optional[Tuple[str, int]]:
    """
    If the request path/method match a heavy endpoint, return (path_key, limit_per_minute).
    Longer path substrings are matched first (e.g. release-gate/validate-async before release-gate/validate).
    """
    if method == "POST" and path.rstrip("/").endswith("/snapshots"):
        return ("snapshots", RATE_LIMIT_SNAPSHOTS_CREATE_PER_MINUTE)
    if method == "POST" and "api-calls" in path:
        return ("api_calls", RATE_LIMIT_INGEST_PER_MINUTE)
    for path_substring, m, limit, path_key in HEAVY_ENDPOINTS:
        if m == method and path_substring in path:
            return (path_key, limit)
    return None


def _prune_memory_heavy() -> None:
    """Remove expired entries from in-memory heavy rate store."""
    now = time.time()
    expired = [k for k, (_, end) in _memory_heavy.items() if end <= now]
    for k in expired:
        del _memory_heavy[k]


def _check_rate_limit_memory_heavy(heavy_key: str, limit: int) -> bool:
    """Rate limit for heavy endpoints using in-memory store."""
    _prune_memory_heavy()
    now = time.time()
    if heavy_key not in _memory_heavy:
        _memory_heavy[heavy_key] = (1, now + _MEMORY_WINDOW_SEC)
        return True
    count, window_end = _memory_heavy[heavy_key]
    if window_end <= now:
        _memory_heavy[heavy_key] = (1, now + _MEMORY_WINDOW_SEC)
        return True
    if count >= limit:
        return False
    _memory_heavy[heavy_key] = (count + 1, window_end)
    return True


def check_endpoint_rate_limit(
    client_ip: str,
    path_key: str,
    limit_per_minute: int,
    window_sec: int = 60,
) -> bool:
    """
    Returns True if under limit (and increments). False if over limit.
    Uses Redis when enabled, else in-memory _memory_heavy.
    """
    heavy_key = f"rate_limit:heavy:{path_key}:{client_ip}"
    if cache_service.enabled:
        current = cache_service.get(heavy_key)
        if current is None:
            cache_service.set(heavy_key, 1, ttl=window_sec)
            return True
        if current >= limit_per_minute:
            return False
        cache_service.set(heavy_key, current + 1, ttl=window_sec)
        return True
    return _check_rate_limit_memory_heavy(heavy_key, limit_per_minute)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware for rate limiting API requests"""

    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks and OPTIONS requests (CORS preflight)
        if request.url.path in ["/health", "/"] or request.method == "OPTIONS":
            return await call_next(request)

        client_id = self._get_client_id(request)
        client_ip = client_id.replace("rate_limit:", "", 1) if client_id.startswith("rate_limit:") else client_id

        # Global rate limit (all endpoints)
        if not self._check_rate_limit(client_id):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {self.requests_per_minute} requests per minute.",
            )

        # Heavy-endpoint rate limit (stricter per-endpoint limit)
        heavy = _get_heavy_limit(request.url.path, request.method)
        if heavy is not None:
            path_key, limit = heavy
            if not check_endpoint_rate_limit(client_ip, path_key, limit):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded for this endpoint. Maximum {limit} requests per minute. Try again later.",
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
