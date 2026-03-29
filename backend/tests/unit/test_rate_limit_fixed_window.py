import app.middleware.rate_limit as rate_limit


class _FakeRedis:
    def __init__(self):
        self.counts = {}
        self.expire_calls = []

    def incr(self, key: str) -> int:
        next_value = int(self.counts.get(key, 0)) + 1
        self.counts[key] = next_value
        return next_value

    def expire(self, key: str, ttl: int) -> bool:
        self.expire_calls.append((key, ttl))
        return True


def test_check_user_rate_limit_uses_fixed_window_with_single_expire(monkeypatch):
    fake_redis = _FakeRedis()
    monkeypatch.setattr(rate_limit.cache_service, "enabled", True, raising=True)
    monkeypatch.setattr(rate_limit.cache_service, "redis_client", fake_redis, raising=True)

    assert rate_limit.check_user_rate_limit("user-1", 2, bucket_key="live_view_read") is True
    assert rate_limit.check_user_rate_limit("user-1", 2, bucket_key="live_view_read") is True
    assert rate_limit.check_user_rate_limit("user-1", 2, bucket_key="live_view_read") is False

    assert fake_redis.expire_calls == [("rate_limit:user:live_view_read:user-1", 60)]


def test_check_endpoint_rate_limit_uses_fixed_window_with_single_expire(monkeypatch):
    fake_redis = _FakeRedis()
    monkeypatch.setattr(rate_limit.cache_service, "enabled", True, raising=True)
    monkeypatch.setattr(rate_limit.cache_service, "redis_client", fake_redis, raising=True)

    assert rate_limit.check_endpoint_rate_limit("127.0.0.1", "release_gate_validate", 2) is True
    assert rate_limit.check_endpoint_rate_limit("127.0.0.1", "release_gate_validate", 2) is True
    assert rate_limit.check_endpoint_rate_limit("127.0.0.1", "release_gate_validate", 2) is False

    assert fake_redis.expire_calls == [("rate_limit:heavy:release_gate_validate:127.0.0.1", 60)]


def test_global_rate_limit_uses_fixed_window_with_single_expire(monkeypatch):
    fake_redis = _FakeRedis()
    monkeypatch.setattr(rate_limit.cache_service, "enabled", True, raising=True)
    monkeypatch.setattr(rate_limit.cache_service, "redis_client", fake_redis, raising=True)

    middleware = rate_limit.RateLimitMiddleware(app=lambda scope, receive, send: None, requests_per_minute=2)

    assert middleware._check_rate_limit("rate_limit:127.0.0.1") is True
    assert middleware._check_rate_limit("rate_limit:127.0.0.1") is True
    assert middleware._check_rate_limit("rate_limit:127.0.0.1") is False

    assert fake_redis.expire_calls == [("rate_limit:127.0.0.1", 60)]
