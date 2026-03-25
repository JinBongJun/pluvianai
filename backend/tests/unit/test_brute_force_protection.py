import pytest

from app.services import brute_force_protection as bf_module
from app.services.brute_force_protection import BruteForceProtectionService


@pytest.mark.unit
class TestBruteForceProtectionFallback:
    def test_fallback_blocks_after_threshold_without_redis(self, monkeypatch):
        monkeypatch.setattr(bf_module.cache_service, "enabled", False)
        service = BruteForceProtectionService()
        now = [1_000.0]
        monkeypatch.setattr(service, "_now", lambda: now[0])

        email = "user@example.com"
        ip = "127.0.0.1"

        assert service.check_allowed(email, ip).allowed is True
        service.register_failure(email, ip)
        service.register_failure(email, ip)
        third = service.register_failure(email, ip)

        assert third.allowed is False
        assert third.wait_seconds == 60
        assert third.require_captcha is False

        precheck = service.check_allowed(email, ip)
        assert precheck.allowed is False
        assert precheck.wait_seconds == 60

    def test_fallback_unlocks_after_cooldown_window(self, monkeypatch):
        monkeypatch.setattr(bf_module.cache_service, "enabled", False)
        service = BruteForceProtectionService()
        now = [2_000.0]
        monkeypatch.setattr(service, "_now", lambda: now[0])

        email = "cooldown@example.com"
        ip = "127.0.0.2"

        for _ in range(3):
            service.register_failure(email, ip)

        blocked = service.check_allowed(email, ip)
        assert blocked.allowed is False
        assert blocked.wait_seconds == 60

        now[0] += 61.0
        after_cooldown = service.check_allowed(email, ip)
        assert after_cooldown.allowed is True

    def test_fallback_requires_captcha_after_high_failure_count(self, monkeypatch):
        monkeypatch.setattr(bf_module.cache_service, "enabled", False)
        service = BruteForceProtectionService()
        now = [3_000.0]
        monkeypatch.setattr(service, "_now", lambda: now[0])

        email = "high-risk@example.com"
        ip = "10.0.0.9"

        for _ in range(20):
            service.register_failure(email, ip)

        result = service.check_allowed(email, ip)
        assert result.allowed is False
        assert result.require_captcha is True
        assert result.wait_seconds == 3600

    def test_fallback_resets_after_success(self, monkeypatch):
        monkeypatch.setattr(bf_module.cache_service, "enabled", False)
        service = BruteForceProtectionService()

        email = "reset@example.com"
        ip = "192.168.0.7"

        for _ in range(3):
            service.register_failure(email, ip)

        assert service.check_allowed(email, ip).allowed is False

        service.register_success(email, ip)

        assert service.check_allowed(email, ip).allowed is True
