"""
Brute force protection service.

Tracks failed login attempts per IP and account, applies exponential backoff,
and signals when a CAPTCHA or lockout should be enforced.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple
from app.services.cache_service import cache_service
from app.core.logging_config import logger


@dataclass
class BruteForceResult:
    allowed: bool
    wait_seconds: int = 0
    require_captcha: bool = False
    reason: Optional[str] = None


class BruteForceProtectionService:
    """
    Simple IP/account-based throttling with exponential backoff using Redis.
    """

    def __init__(self):
        # (failures, wait_seconds)
        self.thresholds: Tuple[Tuple[int, int], ...] = (
            (3, 60),        # 1 minute
            (5, 300),       # 5 minutes
            (10, 900),      # 15 minutes
            (15, 3600),     # 1 hour
        )
        self.captcha_threshold = 20

    def _key_ip(self, ip: str) -> str:
        return f"bf:ip:{ip}"

    def _key_account(self, email: str) -> str:
        return f"bf:acct:{email.lower()}"

    def _get_failures(self, key: str) -> int:
        count = cache_service.get(key)
        return int(count) if count is not None else 0

    def _increment(self, key: str) -> int:
        if not cache_service.enabled:
            return 0
        current = self._get_failures(key)
        new_count = current + 1
        # TTL at least 1 hour for tracking, extended on each failure
        cache_service.set(key, new_count, ttl=3600)
        return new_count

    def _reset(self, key: str):
        if cache_service.enabled:
            cache_service.delete(key)

    def _evaluate(self, failures: int) -> BruteForceResult:
        wait = 0
        require_captcha = False
        for threshold, seconds in self.thresholds:
            if failures >= threshold:
                wait = seconds
        if failures >= self.captcha_threshold:
            require_captcha = True
            wait = max(wait, 3600)

        if wait > 0:
            return BruteForceResult(
                allowed=False,
                wait_seconds=wait,
                require_captcha=require_captcha,
                reason="too_many_attempts",
            )

        return BruteForceResult(allowed=True)

    def check_allowed(self, email: str, ip: Optional[str]) -> BruteForceResult:
        """
        Check if login is allowed for the given email/IP combination.
        """
        if not cache_service.enabled:
            return BruteForceResult(allowed=True)

        failures_ip = self._get_failures(self._key_ip(ip or "unknown"))
        failures_acct = self._get_failures(self._key_account(email))
        failures = max(failures_ip, failures_acct)
        result = self._evaluate(failures)
        if not result.allowed:
            logger.warning(
                "Brute force protection triggered",
                extra={
                    "email": email,
                    "ip": ip,
                    "failures_ip": failures_ip,
                    "failures_acct": failures_acct,
                    "wait_seconds": result.wait_seconds,
                    "require_captcha": result.require_captcha,
                },
            )
        return result

    def register_failure(self, email: str, ip: Optional[str]) -> BruteForceResult:
        """
        Record a failed attempt and return the current decision.
        """
        key_ip = self._key_ip(ip or "unknown")
        key_acct = self._key_account(email)
        failures_ip = self._increment(key_ip)
        failures_acct = self._increment(key_acct)
        failures = max(failures_ip, failures_acct)
        return self._evaluate(failures)

    def register_success(self, email: str, ip: Optional[str]):
        """
        Clear counters after a successful login.
        """
        self._reset(self._key_ip(ip or "unknown"))
        self._reset(self._key_account(email))


brute_force_service = BruteForceProtectionService()
