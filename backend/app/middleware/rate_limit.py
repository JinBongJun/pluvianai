"""
Rate limiting middleware.

Bucketed limits:
- dashboard_read: high-frequency internal UI polling and light reads
- expensive_read: heavier read paths and report/detail queries
- mutations: user-driven writes and settings changes
- ingest: SDK / telemetry writes
- default: everything else

Uses Redis when available; falls back to in-memory per-process limits when Redis is disabled.
"""

import time
from typing import Dict, Optional, Tuple
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.logging_config import logger
from app.core.metrics import rate_limit_exceeded_total
from app.services.cache_service import cache_service
from app.core.responses import error_response

# In-memory fallback when Redis is unavailable: client_id -> (count, window_end_ts)
_memory_rate: Dict[str, Tuple[int, float]] = {}
_memory_heavy: Dict[str, Tuple[int, float]] = {}
_memory_user: Dict[str, Tuple[int, float]] = {}
_MEMORY_WINDOW_SEC = 60

# Global IP fallback limit (coarse abuse protection)
GLOBAL_RATE_LIMIT_PER_MINUTE = 600

# Per-user bucket limits
BUCKET_LIMITS_PER_MINUTE: Dict[str, int] = {
    "dashboard_read": 1200,
    # Job status polling; keep above normal multi-tab usage and short bursts.
    # This path is also protected by client backoff and a short-lived server cache.
    "release_gate_job_poll": 900,
    "expensive_read": 90,
    "mutations": 45,
    "ingest": 1200,
    "default": 120,
}

BUCKET_WINDOW_SEC = 60

# Heavy endpoints: (path_substring, method, limit_per_min, path_key). Longest path first.
HEAVY_ENDPOINTS: Tuple[Tuple[str, str, int, str], ...] = (
    ("release-gate/validate-async", "POST", 30, "release_gate_validate"),
    ("release-gate/validate", "POST", 30, "release_gate_validate"),
    ("quality/evaluate", "POST", 20, "quality_evaluate"),
    ("behavior/validate", "POST", 20, "behavior_validate"),
    ("behavior/compare", "POST", 20, "behavior_compare"),
)
RATE_LIMIT_INGEST_PER_MINUTE = 1200
RATE_LIMIT_SNAPSHOTS_CREATE_PER_MINUTE = 120


def _normalize_path(path: str) -> str:
    path = path or ""
    if path.startswith("/api/v1/"):
        return path[len("/api/v1") :]
    if path.startswith("/api/v1"):
        return "/"
    return path


def _is_light_snapshot_read(path: str, method: str, request: Request) -> bool:
    if method != "GET" or not path.rstrip("/").endswith("/snapshots"):
        return False
    light_value = str(request.query_params.get("light", "")).strip().lower()
    return light_value in {"1", "true", "yes"}


def classify_rate_limit_bucket(request: Request) -> str:
    method = request.method.upper()
    path = _normalize_path(request.url.path)

    if method == "POST" and ("api-calls" in path or path.rstrip("/").endswith("/snapshots")):
        return "ingest"

    if method in {"PATCH", "POST", "DELETE"}:
        if (
            "/live-view/agents/" in path
            or "/saved-logs" in path
            or "/members" in path
            or "/user-api-keys" in path
            or "/settings" in path
        ):
            return "mutations"

    if method == "GET":
        if "/release-gate/jobs/" in path and path.rstrip("/").endswith("/stream"):
            return "dashboard_read"

        if "/release-gate/jobs/" in path:
            return "release_gate_job_poll"

        if (
            path == "/organizations"
            or path == "/projects"
            or "/live-view/agents" in path
            or path.endswith("/evaluation")
            or path.endswith("/settings")
            or _is_light_snapshot_read(path, method, request)
        ):
            return "dashboard_read"

        if (
            "/release-gate" in path
            or "/behavior" in path
            or path.rstrip("/").endswith("/snapshots")
            or "/saved-logs" in path
        ):
            return "expensive_read"

    return "default"


def _rate_limit_headers(bucket: str, limit: int, retry_after_sec: int) -> Dict[str, str]:
    return {
        "Retry-After": str(retry_after_sec),
        "X-RateLimit-Limit": str(limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": str(retry_after_sec),
        "X-RateLimit-Bucket": bucket,
    }


def _rate_limit_response(bucket: str, limit: int, scope: str) -> JSONResponse:
    retry_after_sec = BUCKET_WINDOW_SEC
    return error_response(
        code="RATE_LIMIT_EXCEEDED",
        message="Too many requests. Please wait a moment and try again.",
        details={
            "bucket": bucket,
            "scope": scope,
            "limit": limit,
            "window_sec": BUCKET_WINDOW_SEC,
            "retry_after_sec": retry_after_sec,
        },
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers=_rate_limit_headers(bucket, limit, retry_after_sec),
    )


def _observe_rate_limit_exceeded(bucket: str, scope: str, path: str, method: str) -> None:
    normalized_path = _normalize_path(path)
    try:
        rate_limit_exceeded_total.labels(
            bucket=bucket,
            scope=scope,
            endpoint=normalized_path,
            method=method.upper(),
        ).inc()
    except Exception:
        logger.debug("rate_limit_metric_emit_failed", exc_info=True)

    logger.warning(
        "rate_limit_exceeded",
        extra={
            "bucket": bucket,
            "scope": scope,
            "path": normalized_path,
            "method": method.upper(),
        },
    )


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


def _extract_user_id_from_request(request: Request) -> Optional[str]:
    """
    Extract user_id (sub) from JWT if present and valid. No DB access.
    Returns None if no token, SDK key (ag_live_/ag_test_), or invalid JWT.
    """
    auth = (request.headers.get("Authorization") or "").strip()
    token = None
    if auth.startswith("Bearer "):
        token = auth.replace("Bearer ", "", 1).strip()
    if not token and getattr(request, "cookies", None):
        token = request.cookies.get("access_token") or None
    if not token or token.startswith("ag_live_") or token.startswith("ag_test_"):
        return None
    try:
        from jose import jwt, JWTError
        from app.core.config import settings
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False, "leeway": 60},
        )
        if payload.get("type") != "access":
            return None
        sub = payload.get("sub")
        return str(sub) if sub is not None else None
    except Exception:
        return None


def _prune_memory_user() -> None:
    """Remove expired entries from in-memory user rate store."""
    now = time.time()
    expired = [k for k, (_, end) in _memory_user.items() if end <= now]
    for k in expired:
        del _memory_user[k]


def _check_rate_limit_memory_user(user_key: str, limit: int) -> bool:
    """Rate limit per user using in-memory store."""
    _prune_memory_user()
    now = time.time()
    if user_key not in _memory_user:
        _memory_user[user_key] = (1, now + _MEMORY_WINDOW_SEC)
        return True
    count, window_end = _memory_user[user_key]
    if window_end <= now:
        _memory_user[user_key] = (1, now + _MEMORY_WINDOW_SEC)
        return True
    if count >= limit:
        return False
    _memory_user[user_key] = (count + 1, window_end)
    return True


def check_user_rate_limit(
    user_id: str,
    limit_per_minute: int,
    window_sec: int = 60,
    bucket_key: str = "default",
) -> bool:
    """
    Returns True if user is under limit (and increments). False if over limit.
    Uses Redis when enabled, else in-memory _memory_user.
    """
    user_key = f"rate_limit:user:{bucket_key}:{user_id}"
    if cache_service.enabled:
        current = cache_service.get(user_key)
        if current is None:
            cache_service.set(user_key, 1, ttl=window_sec)
            return True
        if current >= limit_per_minute:
            return False
        cache_service.set(user_key, current + 1, ttl=window_sec)
        return True
    return _check_rate_limit_memory_user(user_key, limit_per_minute)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware for rate limiting API requests"""

    def __init__(self, app, requests_per_minute: int = GLOBAL_RATE_LIMIT_PER_MINUTE):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks and OPTIONS requests (CORS preflight)
        if request.url.path in ["/health", "/"] or request.method == "OPTIONS":
            return await call_next(request)

        request_path = request.url.path
        request_method = request.method
        client_id = self._get_client_id(request)
        client_ip = client_id.replace("rate_limit:", "", 1) if client_id.startswith("rate_limit:") else client_id
        bucket = classify_rate_limit_bucket(request)
        bucket_limit = BUCKET_LIMITS_PER_MINUTE.get(bucket, BUCKET_LIMITS_PER_MINUTE["default"])

        # Global rate limit (all endpoints)
        if not self._check_rate_limit(client_id):
            _observe_rate_limit_exceeded("global_ip", "ip", request_path, request_method)
            return _rate_limit_response("global_ip", self.requests_per_minute, "ip")

        # Per-user rate limit (when JWT present; avoids NAT/shared-IP throttling)
        user_id = _extract_user_id_from_request(request)
        if user_id and not check_user_rate_limit(user_id, bucket_limit, bucket_key=bucket):
            _observe_rate_limit_exceeded(bucket, "user", request_path, request_method)
            return _rate_limit_response(bucket, bucket_limit, "user")

        # Heavy-endpoint rate limit (stricter per-endpoint limit)
        heavy = _get_heavy_limit(request.url.path, request.method)
        if heavy is not None:
            path_key, limit = heavy
            if not check_endpoint_rate_limit(client_ip, path_key, limit):
                _observe_rate_limit_exceeded(path_key, "endpoint", request_path, request_method)
                return _rate_limit_response(path_key, limit, "endpoint")

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
