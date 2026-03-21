"""SDK ingest privacy helpers (sys.path to bundled sdk/python)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "sdk" / "python"))

from pluvianai import PluvianAI  # noqa: E402


@pytest.mark.unit
def test_sanitize_omits_request_message_bodies_when_disabled():
    p = PluvianAI(api_key="x", project_id=1, enabled=False, log_request_bodies=False)
    rd, rs, te = p._sanitize_for_ingest(
        {"messages": [{"role": "user", "content": "secret"}]},
        {},
        None,
    )
    assert rd["messages"][0]["content"] == "[omitted]"
    assert rd["_pluvianai_message_bodies_omitted"] is True
    assert te is None


@pytest.mark.unit
def test_sanitize_strips_tool_event_payloads_when_disabled():
    p = PluvianAI(api_key="x", project_id=1, enabled=False, log_tool_event_payloads=False)
    rd, rs, te = p._sanitize_for_ingest(
        {},
        {},
        [{"kind": "tool_result", "name": "x", "input": {"a": 1}, "output": {"b": 2}}],
    )
    assert te is not None
    assert te[0]["input"] == "[omitted]"
    assert te[0]["output"] == "[omitted]"
