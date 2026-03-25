"""request_context_meta / request_overview derivation helpers (live_view)."""

from app.api.v1.endpoints.live_view import _request_context_meta_from_payload, _request_overview_from_payload


def test_meta_none_for_empty_or_non_dict():
    assert _request_context_meta_from_payload(None) is None
    assert _request_context_meta_from_payload({}) is None
    assert _request_context_meta_from_payload("x") is None


def test_meta_from_message_bodies_omitted():
    assert _request_context_meta_from_payload(
        {"request": {"_pluvianai_message_bodies_omitted": True}}
    ) == {"omitted_by_policy": True, "request_text_omitted": True}


def test_meta_from_response_bodies_omitted():
    assert _request_context_meta_from_payload(
        {"response": {"_pluvianai_response_bodies_omitted": True}}
    ) == {"omitted_by_policy": True, "response_text_omitted": True}


def test_meta_truncated_request_or_payload():
    assert _request_context_meta_from_payload({"request": {"_pluvianai_truncated": True}}) == {
        "truncated": True,
        "request_truncated": True,
    }
    assert _request_context_meta_from_payload({"_pluvianai_truncated": True}) == {
        "truncated": True,
        "payload_truncated": True,
    }


def test_meta_combined():
    assert _request_context_meta_from_payload(
        {
            "request": {"_pluvianai_message_bodies_omitted": True, "_pluvianai_truncated": True},
        }
    ) == {
        "omitted_by_policy": True,
        "request_text_omitted": True,
        "truncated": True,
        "request_truncated": True,
    }


def test_request_overview_from_payload():
    overview = _request_overview_from_payload(
        {
            "request": {
                "model": "gpt-4o-mini",
                "messages": [{"role": "system"}, {"role": "user"}],
                "tools": [{"type": "function", "function": {"name": "lookup_order"}}],
                "temperature": 0.2,
                "tool_choice": "required",
                "response_format": {"type": "json_schema"},
                "attachments": [{"id": "file-1"}],
                "locale": "ko-KR",
                "channel": "chat",
            }
        },
        provider="openai",
        model="gpt-4o-mini",
    )

    assert overview == {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "message_count": 2,
        "tools_count": 1,
        "temperature": 0.2,
        "top_p": None,
        "max_tokens": None,
        "request_control_keys": ["temperature", "tool_choice", "response_format"],
        "extended_context_keys": ["attachments"],
        "additional_request_keys": ["locale", "channel"],
        "omitted_by_policy": False,
        "truncated": False,
        "capture_state": "complete",
    }
