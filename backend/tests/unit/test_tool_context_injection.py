from app.services.replay_service import resolve_tool_context_injection_text


def test_resolve_recorded_mode_returns_empty():
    assert resolve_tool_context_injection_text({"mode": "recorded"}, 1) == ""


def test_resolve_global_scope():
    text = resolve_tool_context_injection_text(
        {
            "mode": "inject",
            "inject": {"scope": "global", "global_text": "  hello  "},
        },
        99,
    )
    assert text == "hello"


def test_resolve_per_snapshot_prefers_id_map():
    text = resolve_tool_context_injection_text(
        {
            "mode": "inject",
            "inject": {
                "scope": "per_snapshot",
                "global_text": "fallback",
                "by_snapshot_id": {"7": "seven"},
            },
        },
        7,
    )
    assert text == "seven"


def test_resolve_per_snapshot_fallback_to_global():
    text = resolve_tool_context_injection_text(
        {
            "mode": "inject",
            "inject": {
                "scope": "per_snapshot",
                "global_text": "fallback",
                "by_snapshot_id": {},
            },
        },
        123,
    )
    assert text == "fallback"
