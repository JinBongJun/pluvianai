import json
from unittest.mock import Mock

from app.services import live_view_events


class _FakeRedis:
    def __init__(self, set_results=None):
        self.set_results = list(set_results or [])
        self.set_calls = []
        self.publish_calls = []

    def set(self, key, value, ex=None, nx=None):
        self.set_calls.append({"key": key, "value": value, "ex": ex, "nx": nx})
        if self.set_results:
            return self.set_results.pop(0)
        return True

    def publish(self, channel, payload):
        self.publish_calls.append((channel, payload))
        return 1


def test_publish_agents_changed_debounces_high_frequency_refresh(monkeypatch):
    fake_redis = _FakeRedis(set_results=[True, None])
    delete_pattern = Mock()

    monkeypatch.setattr(live_view_events.cache_service, "enabled", True, raising=True)
    monkeypatch.setattr(live_view_events.cache_service, "redis_client", fake_redis, raising=True)
    monkeypatch.setattr(live_view_events.cache_service, "delete_pattern", delete_pattern, raising=True)

    live_view_events.publish_agents_changed(123, ["agent-a", "agent-a", "agent-b"])
    live_view_events.publish_agents_changed(123, ["agent-c"])

    assert len(fake_redis.set_calls) == 2
    assert fake_redis.set_calls[0]["key"] == "project:123:live_view:agents_changed:cooldown"
    assert fake_redis.set_calls[0]["ex"] == live_view_events.LIVE_VIEW_EVENT_DEBOUNCE_SEC
    assert fake_redis.set_calls[0]["nx"] is True
    assert delete_pattern.call_count == 2
    delete_pattern.assert_any_call("project:123:live_view:agents:*")
    delete_pattern.assert_any_call("project:123:release_gate:agents:*")
    assert len(fake_redis.publish_calls) == 1

    channel, payload = fake_redis.publish_calls[0]
    assert channel == "project:123:live_view:events"
    assert json.loads(payload) == {
        "type": "agents_changed",
        "project_id": 123,
        "agent_ids": ["agent-a", "agent-b"],
    }


def test_publish_agents_changed_force_refresh_bypasses_debounce(monkeypatch):
    fake_redis = _FakeRedis(set_results=[None])
    delete_pattern = Mock()

    monkeypatch.setattr(live_view_events.cache_service, "enabled", True, raising=True)
    monkeypatch.setattr(live_view_events.cache_service, "redis_client", fake_redis, raising=True)
    monkeypatch.setattr(live_view_events.cache_service, "delete_pattern", delete_pattern, raising=True)

    live_view_events.publish_agents_changed(456, ["agent-z"], force_refresh=True)

    assert fake_redis.set_calls == []
    assert delete_pattern.call_count == 2
    assert len(fake_redis.publish_calls) == 1
    assert json.loads(fake_redis.publish_calls[0][1])["agent_ids"] == ["agent-z"]
