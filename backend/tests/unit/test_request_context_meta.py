"""request_context_meta derivation from ingest privacy markers (live_view)."""

from app.api.v1.endpoints.live_view import _request_context_meta_from_payload


def test_meta_none_for_empty_or_non_dict():
    assert _request_context_meta_from_payload(None) is None
    assert _request_context_meta_from_payload({}) is None
    assert _request_context_meta_from_payload("x") is None


def test_meta_from_message_bodies_omitted():
    assert _request_context_meta_from_payload(
        {"request": {"_pluvianai_message_bodies_omitted": True}}
    ) == {"omitted_by_policy": True}


def test_meta_from_response_bodies_omitted():
    assert _request_context_meta_from_payload(
        {"response": {"_pluvianai_response_bodies_omitted": True}}
    ) == {"omitted_by_policy": True}


def test_meta_truncated_request_or_payload():
    assert _request_context_meta_from_payload({"request": {"_pluvianai_truncated": True}}) == {
        "truncated": True
    }
    assert _request_context_meta_from_payload({"_pluvianai_truncated": True}) == {"truncated": True}


def test_meta_combined():
    assert _request_context_meta_from_payload(
        {
            "request": {"_pluvianai_message_bodies_omitted": True, "_pluvianai_truncated": True},
        }
    ) == {"omitted_by_policy": True, "truncated": True}
