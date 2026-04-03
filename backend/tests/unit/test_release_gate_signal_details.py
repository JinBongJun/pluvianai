import pytest

from app.services.release_gate_signal_details import build_release_gate_signal_details


@pytest.mark.unit
def test_build_release_gate_signal_details_captures_json_and_length_fields():
    details = build_release_gate_signal_details(
        signals_checks={"json": "pass", "length": "fail"},
        eval_config={
            "json": {"mode": "always"},
            "length": {"fail_ratio": 0.2},
        },
        candidate_response_preview='{"ok": true}',
        latency_ms=25,
        status_code=200,
        baseline_len=5,
    )

    assert details["json"] == {
        "status": "pass",
        "mode": "always",
        "checked": True,
        "parsed_ok": True,
    }
    assert details["length"]["status"] == "fail"
    assert details["length"]["fail_ratio"] == 0.2
    assert details["length"]["baseline_len"] == 5
    assert details["length"]["actual_chars"] == len('{"ok": true}')


@pytest.mark.unit
def test_build_release_gate_signal_details_marks_refusal_and_repetition():
    details = build_release_gate_signal_details(
        signals_checks={"refusal": "fail", "repetition": "fail", "tool": "pass"},
        eval_config={"repetition": {"fail_line_repeats": 2}},
        candidate_response_preview="I cannot help with that.\nSame line\nSame line\nSame line",
        latency_ms=None,
        status_code=None,
        baseline_len=None,
    )

    assert details["refusal"]["matched"] is True
    assert details["repetition"]["max_line_repeats"] == 3
    assert details["repetition"]["fail_line_repeats"] == 2
    assert details["tool"] == {"status": "pass"}
