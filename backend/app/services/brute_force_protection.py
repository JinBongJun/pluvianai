"""
Brute force protection service.

Tracks failed login attempts per IP and account, applies exponential backoff,
and signals when a CAPTCHA or lockout should be enforced.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Optional, Tuple
import threading
import time
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
    Simple IP/account-based throttling with exponential backoff.

    Primary storage is Redis; if Redis is unavailable, it falls back to
    process-local in-memory counters so protection still works fail-closed.
    """

    def __init__(self):
        # (failures, wait_seconds)
        self.thresholds: Tuple[Tuple[int, int], ...] = (
            (3, 60),  # 1 minute
            (5, 300),  # 5 minutes
            (10, 900),  # 15 minutes
            (15, 3600),  # 1 hour
        )
        self.captcha_threshold = 20
        self.counter_ttl_seconds = 3600
        # key -> (failure_count, blocked_until_epoch, ttl_expires_at_epoch)
        self._local_counters: dict[str, tuple[int, float, float]] = {}
        self._local_lock = threading.Lock()

    def _key_ip(self, ip: str) -> str:
        return f"bf:ip:{ip}"

    def _key_account(self, email: str) -> str:
        return f"bf:acct:{email.lower()}"

    def _now(self) -> float:
        return time.time()

    def _get_state(self, key: str) -> tuple[int, float]:
        if cache_service.enabled:
            raw = cache_service.get(key)
            if isinstance(raw, dict):
                count = int(raw.get("count") or 0)
                blocked_until = float(raw.get("blocked_until") or 0.0)
                return count, blocked_until
            # Backward compatibility for legacy integer payload.
            count = int(raw) if raw is not None else 0
            return count, 0.0

        now = self._now()
        with self._local_lock:
            counter = self._local_counters.get(key)
            if not counter:
                return 0, 0.0
            count, blocked_until, expires_at = counter
            if expires_at <= now:
                self._local_counters.pop(key, None)
                return 0, 0.0
            return int(count), float(blocked_until)

    def _set_state(self, key: str, count: int, blocked_until: float) -> None:
        if cache_service.enabled:
            cache_service.set(
                key,
                {"count": int(count), "blocked_until": float(blocked_until)},
                ttl=self.counter_ttl_seconds,
            )
            return

        now = self._now()
        with self._local_lock:
            self._local_counters[key] = (
                int(count),
                float(blocked_until),
                now + self.counter_ttl_seconds,
            )

    def _threshold_wait(self, failures: int) -> tuple[int, bool]:
        wait = 0
        require_captcha = False
        for threshold, seconds in self.thresholds:
            if failures >= threshold:
                wait = seconds
        if failures >= self.captcha_threshold:
            require_captcha = True
            wait = max(wait, 3600)
        return wait, require_captcha

    def _evaluate(self, failures: int, blocked_until: float) -> BruteForceResult:
        now = self._now()
        wait, require_captcha = self._threshold_wait(failures)
        remaining = max(0, int(math.ceil(blocked_until - now)))

        if remaining > 0:
            return BruteForceResult(
                allowed=False,
                wait_seconds=remaining,
                require_captcha=require_captcha,
                reason="too_many_attempts",
            )

        # Cooldown ended: allow next attempt. CAPTCHA challenge is enforced only
        # while actively blocked, then normal auth can resume.
        return BruteForceResult(allowed=True)

    def _reset(self, key: str):
        if cache_service.enabled:
            cache_service.delete(key)
            return
        with self._local_lock:
            self._local_counters.pop(key, None)

    def check_allowed(self, email: str, ip: Optional[str]) -> BruteForceResult:
        """
        Check if login is allowed for the given email/IP combination.
        """
        failures_ip, blocked_until_ip = self._get_state(self._key_ip(ip or "unknown"))
        failures_acct, blocked_until_acct = self._get_state(self._key_account(email))
        failures = max(failures_ip, failures_acct)
        blocked_until = max(blocked_until_ip, blocked_until_acct)
        result = self._evaluate(failures, blocked_until)
        if not result.allowed:
            logger.warning(
                "Brute force protection triggered",
                extra={
                    "email": email,
                    "ip": ip,
                    "failures_ip": failures_ip,
                    "failures_acct": failures_acct,
                    "blocked_until_ip": blocked_until_ip,
                    "blocked_until_acct": blocked_until_acct,
                    "wait_seconds": result.wait_seconds,
                    "require_captcha": result.require_captcha,
                },
            )
        return result

    def register_failure(self, email: str, ip: Optional[str]) -> BruteForceResult:
        """
        Record a failed attempt and return the current decision.
        """
        now = self._now()
        key_ip = self._key_ip(ip or "unknown")
        key_acct = self._key_account(email)
        failures_ip, _ = self._get_state(key_ip)
        failures_acct, _ = self._get_state(key_acct)
        failures_ip += 1
        failures_acct += 1

        wait_ip, _ = self._threshold_wait(failures_ip)
        wait_acct, _ = self._threshold_wait(failures_acct)
        blocked_until_ip = now + wait_ip if wait_ip > 0 else 0.0
        blocked_until_acct = now + wait_acct if wait_acct > 0 else 0.0

        self._set_state(key_ip, failures_ip, blocked_until_ip)
        self._set_state(key_acct, failures_acct, blocked_until_acct)

        failures = max(failures_ip, failures_acct)
        blocked_until = max(blocked_until_ip, blocked_until_acct)
        return self._evaluate(failures, blocked_until)

    def register_success(self, email: str, ip: Optional[str]):
        """
        Clear counters after a successful login.
        """
        self._reset(self._key_ip(ip or "unknown"))
        self._reset(self._key_account(email))


brute_force_service = BruteForceProtectionService()
