"""
Simple circuit breaker utility.
"""

from __future__ import annotations

import time
from typing import Callable, Type, Iterable


class CircuitBreakerOpen(Exception):
    """Raised when circuit is open."""


class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_time_seconds: int = 30,
        exception_types: Iterable[Type[BaseException]] = (Exception,),
    ):
        self.failure_threshold = failure_threshold
        self.recovery_time_seconds = recovery_time_seconds
        self.exception_types = tuple(exception_types)
        self.failures = 0
        self.state = "closed"  # closed, open, half-open
        self.opened_at = 0.0

    def _can_attempt(self) -> bool:
        if self.state == "closed":
            return True
        if self.state == "open":
            if time.time() - self.opened_at >= self.recovery_time_seconds:
                self.state = "half-open"
                return True
            return False
        if self.state == "half-open":
            return True
        return True

    def call(self, func: Callable, *args, **kwargs):
        if not self._can_attempt():
            raise CircuitBreakerOpen("Circuit breaker is open")

        try:
            result = func(*args, **kwargs)
        except self.exception_types:
            self._record_failure()
            raise
        else:
            self._record_success()
            return result

    async def call_async(self, func: Callable, *args, **kwargs):
        if not self._can_attempt():
            raise CircuitBreakerOpen("Circuit breaker is open")

        try:
            result = await func(*args, **kwargs)
        except self.exception_types:
            self._record_failure()
            raise
        else:
            self._record_success()
            return result

    def _record_failure(self):
        self.failures += 1
        if self.failures >= self.failure_threshold:
            self.state = "open"
            self.opened_at = time.time()

    def _record_success(self):
        self.failures = 0
        self.state = "closed"
