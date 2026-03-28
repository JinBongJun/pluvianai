"""
Token/cost helpers for SDK ingest and snapshot persistence.

Prefer provider `usage.total_tokens` when present; else sum normalized prompt + completion tokens.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


def total_tokens_for_ingest(
    response_data: Optional[Dict[str, Any]],
    normalized: Optional[Dict[str, Any]],
) -> Optional[int]:
    """Best-effort total tokens for a single LLM response + normalizer output."""
    rd = response_data or {}
    usage = rd.get("usage") if isinstance(rd.get("usage"), dict) else None
    if usage is not None:
        tt = usage.get("total_tokens")
        if tt is not None:
            try:
                v = int(tt)
                if v >= 0:
                    return v
            except (TypeError, ValueError):
                pass

    norm = normalized or {}
    rt = norm.get("request_tokens")
    st = norm.get("response_tokens")
    if rt is None and st is None:
        return None
    a = int(rt or 0)
    b = int(st or 0)
    if a == 0 and b == 0:
        return None
    return a + b


def cost_from_normalized(normalized: Optional[Dict[str, Any]]) -> Optional[float]:
    """Optional USD-like cost from normalizer; None if absent or zero."""
    if not normalized:
        return None
    c = normalized.get("cost")
    if c is None:
        return None
    try:
        f = float(c)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def tokens_from_response_usage_only(response_data: Optional[Dict[str, Any]]) -> Optional[int]:
    """Extract total_tokens from a response object (e.g. payload['response']) when normalizer did not run."""
    rd = response_data or {}
    usage = rd.get("usage") if isinstance(rd.get("usage"), dict) else None
    if usage is None:
        return None
    tt = usage.get("total_tokens")
    if tt is None:
        return None
    try:
        v = int(tt)
        return v if v >= 0 else None
    except (TypeError, ValueError):
        return None


def prompt_completion_sum_from_response(response_data: Optional[Dict[str, Any]]) -> Optional[int]:
    """OpenAI-style prompt_tokens + completion_tokens when total_tokens is absent."""
    rd = response_data or {}
    usage = rd.get("usage") if isinstance(rd.get("usage"), dict) else None
    if usage is None:
        return None
    pt = usage.get("prompt_tokens")
    ct = usage.get("completion_tokens")
    if pt is None and ct is None:
        return None
    try:
        a = int(pt or 0)
        b = int(ct or 0)
    except (TypeError, ValueError):
        return None
    if a == 0 and b == 0:
        return None
    return a + b


def resolve_tokens_used_for_proxy_payload(
    explicit_tokens: Optional[Any],
    response_obj: Optional[Dict[str, Any]],
) -> Optional[int]:
    """For save_snapshot: payload.tokens_used, else usage on embedded response."""
    if explicit_tokens is not None:
        try:
            v = int(explicit_tokens)
            return v if v >= 0 else None
        except (TypeError, ValueError):
            pass
    if not isinstance(response_obj, dict):
        return None
    tt = tokens_from_response_usage_only(response_obj)
    if tt is not None:
        return tt
    return prompt_completion_sum_from_response(response_obj)
