"""Commit B1: canonical tool_call steps preserve provider tool id as tool_args._call_id."""

import pytest

from app.core.canonical import response_to_canonical_steps


@pytest.mark.unit
def test_openai_tool_call_step_includes_call_id_under_tool_args():
    resp = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "id": "call_abc",
                            "type": "function",
                            "function": {"name": "get_weather", "arguments": '{"city":"Seoul"}'},
                        }
                    ]
                }
            }
        ]
    }
    steps = response_to_canonical_steps(resp, provider_hint="openai", step_order_base=1.0)
    tool_steps = [s for s in steps if s.get("step_type") == "tool_call"]
    assert len(tool_steps) == 1
    assert tool_steps[0]["tool_args"].get("_call_id") == "call_abc"
    assert "city" in tool_steps[0]["tool_args"] or tool_steps[0]["tool_args"].get("city") == "Seoul"


@pytest.mark.unit
def test_anthropic_tool_use_step_includes_call_id_under_tool_args():
    resp = {
        "content": [
            {"type": "tool_use", "id": "toolu_01", "name": "web_search", "input": {"q": "x"}},
        ]
    }
    steps = response_to_canonical_steps(resp, provider_hint="anthropic", step_order_base=2.0)
    tool_steps = [s for s in steps if s.get("step_type") == "tool_call"]
    assert len(tool_steps) == 1
    assert tool_steps[0]["tool_args"].get("_call_id") == "toolu_01"


@pytest.mark.unit
def test_anthropic_tool_result_blocks_become_steps():
    resp = {
        "content": [
            {"type": "tool_use", "id": "toolu_1", "name": "get_weather", "input": {"city": "Seoul"}},
            {"type": "tool_result", "tool_use_id": "toolu_1", "content": [{"type": "text", "text": "22C"}]},
        ]
    }
    steps = response_to_canonical_steps(resp, provider_hint="anthropic", step_order_base=1.0)
    tr_steps = [s for s in steps if s.get("step_type") == "tool_result"]
    assert len(tr_steps) == 1
    assert tr_steps[0]["tool_result"] is not None
    assert tr_steps[0]["tool_result"].get("call_id") == "toolu_1"
    assert tr_steps[0]["tool_args"].get("call_id") == "toolu_1"


@pytest.mark.unit
def test_openai_messages_with_tool_role_yield_tool_result_steps():
    resp = {
        "messages": [
            {"role": "assistant", "content": None, "tool_calls": []},
            {"role": "tool", "tool_call_id": "call_9", "content": '{"ok": true}'},
        ]
    }
    steps = response_to_canonical_steps(resp, provider_hint="openai", step_order_base=1.0)
    tr_steps = [s for s in steps if s.get("step_type") == "tool_result"]
    assert len(tr_steps) == 1
    assert tr_steps[0]["tool_result"]["call_id"] == "call_9"
