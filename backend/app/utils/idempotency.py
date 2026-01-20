"""
Idempotency helper using Redis cache.
"""
from __future__ import annotations

import json
from typing import Any, Callable, Optional
from app.services.cache_service import cache_service


class IdempotencyService:
    def __init__(self, ttl_seconds: int = 300):
        self.ttl = ttl_seconds

    def build_key(self, key: str) -> str:
        return f"idempotency:{key}"

    def get(self, key: str) -> Optional[Any]:
        if not cache_service.enabled:
            return None
        return cache_service.get(self.build_key(key))

    def set(self, key: str, value: Any):
        if not cache_service.enabled:
            return
        cache_service.set(self.build_key(key), value, ttl=self.ttl)

    def execute(self, key: str, func: Callable[[], Any]) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        result = func()
        self.set(key, result)
        return result


idempotency_service = IdempotencyService()
