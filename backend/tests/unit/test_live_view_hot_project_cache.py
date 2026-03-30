from app.api.v1.endpoints import live_view


class _FakeDb:
    def query(self, *_args, **_kwargs):
        raise AssertionError("DB query should not run on project ref cache hit")


def test_load_live_view_project_ref_uses_cache(monkeypatch):
    store = {}

    monkeypatch.setattr(live_view.cache_service, "enabled", True, raising=True)
    monkeypatch.setattr(live_view.cache_service, "get", lambda key: store.get(key), raising=True)
    monkeypatch.setattr(
        live_view.cache_service,
        "set",
        lambda key, value, ttl=3600: store.__setitem__(key, value),
        raising=True,
    )
    monkeypatch.setattr(
        live_view.cache_service,
        "delete",
        lambda key: store.pop(key, None),
        raising=True,
    )

    live_view._cache_live_view_project_ref(
        live_view._LiveViewProjectRef(id=7, owner_id=11, canvas_nodes=[{"id": "agent-1"}])
    )

    project_ref = live_view._load_live_view_project_ref(7, _FakeDb())

    assert project_ref.id == 7
    assert project_ref.owner_id == 11
    assert project_ref.canvas_nodes == [{"id": "agent-1"}]


def test_invalidate_live_view_project_ref_cache_removes_cached_value(monkeypatch):
    store = {}

    monkeypatch.setattr(live_view.cache_service, "enabled", True, raising=True)
    monkeypatch.setattr(live_view.cache_service, "get", lambda key: store.get(key), raising=True)
    monkeypatch.setattr(
        live_view.cache_service,
        "set",
        lambda key, value, ttl=3600: store.__setitem__(key, value),
        raising=True,
    )
    monkeypatch.setattr(
        live_view.cache_service,
        "delete",
        lambda key: store.pop(key, None),
        raising=True,
    )

    project_ref = live_view._LiveViewProjectRef(id=9, owner_id=21, canvas_nodes=None)
    live_view._cache_live_view_project_ref(project_ref)

    assert live_view._cached_live_view_project_ref(9) == project_ref

    live_view._invalidate_live_view_project_ref_cache(9)

    assert live_view._cached_live_view_project_ref(9) is None
