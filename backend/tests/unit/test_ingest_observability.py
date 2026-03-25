from app.utils.ingest_observability import request_data_shape_summary


def test_shape_empty_dict():
    s = request_data_shape_summary({})
    assert s["empty_body"] is True
    assert s["key_count"] == 0
    assert s["has_messages"] is False
    assert len(s["key_fp"]) == 16


def test_shape_with_messages():
    s = request_data_shape_summary({"model": "gpt-4", "messages": []})
    assert s["empty_body"] is False
    assert s["has_messages"] is True
    assert s["key_count"] == 2


def test_shape_non_dict():
    s = request_data_shape_summary(None)
    assert s["key_fp"] == "none"
    assert s["empty_body"] is True


def test_shape_stable_fingerprint():
    a = request_data_shape_summary({"b": 1, "a": 2})
    b = request_data_shape_summary({"a": 9, "b": 8})
    assert a["key_fp"] == b["key_fp"]
