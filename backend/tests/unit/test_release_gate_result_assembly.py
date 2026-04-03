from types import SimpleNamespace

from app.services.release_gate_result_assembly import (
    build_release_gate_case_result,
    build_release_gate_final_payload,
)


def test_build_release_gate_case_result_aggregates_attempts():
    snapshot = SimpleNamespace(id=101, trace_id="trace-101")
    attempts = [
        {
            "pass": True,
            "failure_reasons": [],
            "violations": [{"rule_id": "r-1", "rule_name": "Rule One"}],
            "signals": {"failed": []},
            "replay": {
                "avg_latency_ms": 120,
                "failed": 0,
                "input_tokens": 11,
                "output_tokens": 7,
                "tokens_total": 18,
                "used_credits": 2,
                "error_messages": [],
                "error_codes": [],
                "missing_provider_keys": [],
            },
        },
        {
            "pass": False,
            "failure_reasons": ["policy failed", "policy failed"],
            "violations": [{"rule_id": "r-1", "rule_name": "Rule One"}],
            "signals": {"failed": ["safety"]},
            "replay": {
                "avg_latency_ms": 180,
                "failed": 1,
                "input_tokens": 13,
                "output_tokens": 5,
                "tokens_total": 18,
                "used_credits": 3,
                "error_messages": ["timeout"],
                "error_codes": ["TIMEOUT"],
                "missing_provider_keys": ["openai"],
            },
        },
    ]

    result = build_release_gate_case_result(
        snapshot=snapshot,
        attempts=attempts,
        tool_context_payload={"mode": "test"},
        build_captured_customer_material_from_snapshot=lambda _snapshot: {"captured": True},
        build_rg_injection_report=lambda payload, snapshot_id: {
            "payload_mode": payload["mode"],
            "snapshot_id": snapshot_id,
        },
        aggregate_tool_flow_from_attempts=lambda attempt_rows: {
            "tool_flow_count": len(attempt_rows),
        },
        baseline_capture_usage=lambda _snapshot: {"baseline": "used"},
    )

    assert result["case_status"] == "flaky"
    assert result["summary"]["pass_ratio"] == 0.5
    assert result["summary"]["latency_min_ms"] == 120.0
    assert result["summary"]["latency_max_ms"] == 180.0
    assert result["failure_reasons"] == ["policy failed"]
    assert result["replay"]["avg_latency_ms"] == 150.0
    assert result["replay"]["failed"] == 1
    assert result["replay"]["error_messages"] == ["timeout"]
    assert result["replay"]["error_codes"] == ["TIMEOUT"]
    assert result["replay"]["missing_provider_keys"] == ["openai"]
    assert result["replay"]["input_tokens_sum"] == 24
    assert result["replay"]["output_tokens_sum"] == 12
    assert result["replay"]["tokens_total_sum"] == 36
    assert result["replay"]["used_credits_sum"] == 5
    assert result["eval_elements_failed"] == [
        {"rule_id": "r-1", "rule_name": "Rule One", "violation_count": 2}
    ]
    assert result["context"]["A_captured_customer_material"] == {"captured": True}
    assert result["context"]["B_rg_injection"] == {"payload_mode": "test", "snapshot_id": 101}
    assert result["context"]["tool_flow_count"] == 2
    assert result["baseline_capture"] == {"baseline": "used"}


def test_build_release_gate_final_payload_summarizes_case_results():
    payload = SimpleNamespace(
        fail_rate_max=0.2,
        flaky_rate_max=0.1,
        repeat_runs=2,
    )
    case_results = [
        {
            "trace_id": "trace-fail",
            "snapshot_id": 1,
            "case_status": "fail",
            "summary": {"case_status": "fail", "ruleset_hash": "hash-1"},
            "violations": [{"id": "v1"}],
            "replay": {
                "error_codes": ["TIMEOUT"],
                "missing_provider_keys": ["openai"],
                "failed_snapshot_ids": [1],
            },
            "attempts": [
                {"pass": False, "signals": {"failed": ["signal-a"]}},
                {"pass": False, "signals": {"failed": ["signal-b", "signal-a"]}},
            ],
        },
        {
            "trace_id": "trace-pass",
            "snapshot_id": 2,
            "case_status": "pass",
            "summary": {"case_status": "pass"},
            "violations": [],
            "replay": {"error_codes": [], "missing_provider_keys": []},
            "attempts": [{"pass": True, "signals": {"failed": []}}],
        },
    ]

    result = build_release_gate_final_payload(
        case_results=case_results,
        all_reasons=["reason-1", "reason-1", "reason-2"],
        payload=payload,
        trace_id="fallback-trace",
        baseline_trace_id="baseline-1",
        replay_request_meta={"snapshots": 2},
        tool_context_payload={"context": True},
        perf_attempts=[{"batch_wall_ms": 100}, {"batch_wall_ms": 200}],
        total_wall_ms=555,
        ratio_band=lambda fail_rate: "red" if fail_rate > 0.2 else "green",
    )

    assert result["gate_pass"] is False
    assert result["primary_case"]["trace_id"] == "trace-fail"
    assert result["primary_summary"]["target"] == {
        "type": "release_gate_snapshot",
        "trace_id": "trace-fail",
        "baseline_trace_id": "baseline-1",
        "snapshot_id": 1,
    }
    assert result["primary_summary"]["release_gate"]["failed_inputs"] == 1
    assert result["primary_summary"]["release_gate"]["total_inputs"] == 2
    assert result["primary_summary"]["release_gate"]["total_attempts"] == 3
    assert result["primary_summary"]["release_gate"]["passed_attempts"] == 1
    assert result["primary_summary"]["release_gate"]["ratio_band"] == "red"

    response = result["response_payload"]
    assert response["pass"] is False
    assert response["summary"] == "Failed: fail_rate=50.00%, flaky_rate=0.00% exceed thresholds (fail<=20%, flaky<=10%)"
    assert response["failure_reasons"] == ["reason-1", "reason-2"]
    assert response["failed_signals"] == ["signal-a", "signal-b"]
    assert response["replay_error_codes"] == ["TIMEOUT"]
    assert response["missing_provider_keys"] == ["openai"]
    assert response["perf"]["total_wall_ms"] == 555
    assert response["perf"]["avg_attempt_wall_ms"] == 150.0
    assert response["replay_request_meta"] == {"snapshots": 2}
    assert response["evidence_pack"]["first_violations"] == [{"id": "v1"}]
    assert response["evidence_pack"]["failed_replay_snapshot_ids"] == [1]
    assert response["evidence_pack"]["sample_failure_reasons"] == ["reason-1", "reason-2"]
