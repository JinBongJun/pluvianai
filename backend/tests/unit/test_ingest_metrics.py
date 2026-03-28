"""Unit tests for ingest token/cost helpers."""

from app.utils.ingest_metrics import (
    cost_from_normalized,
    prompt_completion_sum_from_response,
    resolve_tokens_used_for_proxy_payload,
    tokens_from_response_usage_only,
    total_tokens_for_ingest,
)


def test_total_tokens_prefers_usage_total():
    assert (
        total_tokens_for_ingest(
            {"usage": {"total_tokens": 42, "prompt_tokens": 10, "completion_tokens": 32}},
            {"request_tokens": 10, "response_tokens": 32},
        )
        == 42
    )


def test_total_tokens_sums_normalized_when_no_total():
    assert total_tokens_for_ingest({}, {"request_tokens": 5, "response_tokens": 7}) == 12


def test_total_tokens_none_when_missing():
    assert total_tokens_for_ingest({}, {}) is None


def test_cost_from_normalized_positive():
    assert cost_from_normalized({"cost": 0.01}) == 0.01
    assert cost_from_normalized({"cost": 0}) is None
    assert cost_from_normalized({}) is None


def test_resolve_proxy_explicit_wins():
    assert resolve_tokens_used_for_proxy_payload(99, {"usage": {"total_tokens": 1}}) == 99


def test_resolve_proxy_from_usage():
    assert resolve_tokens_used_for_proxy_payload(None, {"usage": {"total_tokens": 50}}) == 50


def test_tokens_from_response_usage_only():
    assert tokens_from_response_usage_only({"usage": {"total_tokens": 3}}) == 3


def test_prompt_completion_sum():
    assert prompt_completion_sum_from_response(
        {"usage": {"prompt_tokens": 2, "completion_tokens": 3}}
    ) == 5
