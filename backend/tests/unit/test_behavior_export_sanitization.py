import pytest

from app.utils.behavior_export_sanitization import sanitize_behavior_report_summary_for_export


@pytest.mark.unit
def test_viewer_redacts_tool_evidence_previews():
    raw = {
        "eval_mode": "replay_test",
        "tool_evidence": [
            {
                "name": "search",
                "status": "recorded",
                "arguments_preview": '{"q":"secret"}',
                "result_preview": "full result",
            }
        ],
        "nested": {
            "tool_loop_events": [
                {
                    "round": 1,
                    "tool_rows": [
                        {"name": "x", "arguments_preview": "a", "result_preview": "b"},
                    ],
                }
            ]
        },
    }
    out = sanitize_behavior_report_summary_for_export(raw, role="viewer")
    assert out["tool_evidence"][0]["arguments_preview"] == "[redacted]"
    assert out["tool_evidence"][0]["result_preview"] == "[redacted]"
    assert out["tool_evidence"][0]["name"] == "search"
    assert out["nested"]["tool_loop_events"][0]["tool_rows"][0]["result_preview"] == "[redacted]"
    # Original unchanged
    assert raw["tool_evidence"][0]["arguments_preview"] == '{"q":"secret"}'


@pytest.mark.unit
def test_owner_unchanged():
    raw = {"tool_evidence": [{"arguments_preview": "keep"}]}
    out = sanitize_behavior_report_summary_for_export(raw, role="owner")
    assert out["tool_evidence"][0]["arguments_preview"] == "keep"
