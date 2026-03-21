import pytest

from app.api.v1.endpoints.release_gate import _tool_evidence_stats_from_gate_result


@pytest.mark.unit
def test_tool_evidence_stats_counts_missing():
    result = {
        "case_results": [
            {
                "attempts": [
                    {
                        "tool_evidence": [
                            {"name": "a", "execution_source": "recorded"},
                            {"name": "b", "execution_source": "missing"},
                            {"name": "c", "status": "missing"},
                        ]
                    }
                ]
            }
        ]
    }
    total, missing = _tool_evidence_stats_from_gate_result(result)
    assert total == 3
    assert missing == 2


@pytest.mark.unit
def test_tool_evidence_stats_empty():
    assert _tool_evidence_stats_from_gate_result(None) == (0, 0)
    assert _tool_evidence_stats_from_gate_result({}) == (0, 0)
