from __future__ import annotations

from typing import Any, Callable, Dict, List


def build_release_gate_case_result(
    *,
    snapshot: Any,
    attempts: List[Dict[str, Any]],
    tool_context_payload: Dict[str, Any] | None,
    build_captured_customer_material_from_snapshot: Callable[[Any], Dict[str, Any]],
    build_rg_injection_report: Callable[[Dict[str, Any] | None, Any], Dict[str, Any]],
    aggregate_tool_flow_from_attempts: Callable[[List[Dict[str, Any]]], Dict[str, Any]],
    baseline_capture_usage: Callable[[Any], Dict[str, Any]],
) -> Dict[str, Any]:
    total_attempts = len(attempts)
    passed_attempts = sum(1 for attempt in attempts if attempt.get("pass"))
    failed_attempts = total_attempts - passed_attempts
    if passed_attempts == total_attempts:
        case_status = "pass"
    elif failed_attempts == total_attempts:
        case_status = "fail"
    else:
        case_status = "flaky"
    is_flaky = case_status == "flaky"
    is_consistently_failing = case_status == "fail"

    latencies = [
        float((attempt.get("replay") or {}).get("avg_latency_ms"))
        for attempt in attempts
        if (attempt.get("replay") or {}).get("avg_latency_ms") is not None
    ]
    latency_min_ms = min(latencies) if latencies else None
    latency_max_ms = max(latencies) if latencies else None

    sum_input_tokens = 0
    sum_output_tokens = 0
    sum_tokens_total = 0
    sum_used_credits = 0
    any_input_tokens = False
    any_output_tokens = False
    any_tokens_total = False
    any_used_credits = False

    failed_rule_counts: Dict[str, int] = {}
    failed_reasons: List[str] = []
    replay_error_messages: List[str] = []
    replay_error_codes: List[str] = []
    missing_provider_keys: List[str] = []
    all_violations: List[Dict[str, Any]] = []
    error_attempt_count = 0

    for attempt in attempts:
        replay = attempt.get("replay") or {}
        if isinstance(replay, dict):
            if replay.get("input_tokens") is not None:
                any_input_tokens = True
                sum_input_tokens += int(replay.get("input_tokens") or 0)
            if replay.get("output_tokens") is not None:
                any_output_tokens = True
                sum_output_tokens += int(replay.get("output_tokens") or 0)
            if replay.get("tokens_total") is not None:
                any_tokens_total = True
                sum_tokens_total += int(replay.get("tokens_total") or 0)
            if replay.get("used_credits") is not None:
                any_used_credits = True
                sum_used_credits += int(replay.get("used_credits") or 0)

        for msg in attempt.get("failure_reasons") or []:
            if msg and msg not in failed_reasons:
                failed_reasons.append(str(msg))
        for msg in replay.get("error_messages") or []:
            if msg and msg not in replay_error_messages:
                replay_error_messages.append(str(msg))
        for code in replay.get("error_codes") or []:
            code_str = str(code or "").strip()
            if code_str and code_str not in replay_error_codes:
                replay_error_codes.append(code_str)
        for provider in replay.get("missing_provider_keys") or []:
            provider_str = str(provider or "").strip()
            if provider_str and provider_str not in missing_provider_keys:
                missing_provider_keys.append(provider_str)
        if int(replay.get("failed") or 0) > 0:
            error_attempt_count += 1
        all_violations.extend(attempt.get("violations") or [])

    for violation in all_violations:
        rule_id = str(violation.get("rule_id") or "").strip()
        if not rule_id:
            continue
        failed_rule_counts[rule_id] = failed_rule_counts.get(rule_id, 0) + 1

    eval_elements_failed = [
        {
            "rule_id": rule_id,
            "rule_name": next(
                (
                    violation.get("rule_name")
                    for violation in all_violations
                    if violation.get("rule_id") == rule_id and violation.get("rule_name")
                ),
                rule_id,
            ),
            "violation_count": count,
        }
        for rule_id, count in sorted(failed_rule_counts.items())
    ]
    pass_ratio = passed_attempts / total_attempts if total_attempts else 0.0

    context_layers: Dict[str, Any] = {
        "A_captured_customer_material": build_captured_customer_material_from_snapshot(snapshot),
        "B_rg_injection": build_rg_injection_report(tool_context_payload, snapshot.id),
    }
    context_layers.update(aggregate_tool_flow_from_attempts(attempts))

    return {
        "run_index": 0,
        "trace_id": snapshot.trace_id,
        "snapshot_id": snapshot.id,
        "pass": case_status == "pass",
        "case_status": case_status,
        "context": context_layers,
        "failure_reasons": failed_reasons if case_status != "pass" else [],
        "violation_count_delta": 0,
        "severity_delta": {"critical": 0, "high": 0, "medium": 0, "low": 0},
        "summary": {
            "eval_mode": "replay_test",
            "case_status": case_status,
            "pass_ratio": round(pass_ratio, 4),
            "is_flaky": is_flaky,
            "is_consistently_failing": is_consistently_failing,
            "latency_min_ms": latency_min_ms,
            "latency_max_ms": latency_max_ms,
        },
        "violations": all_violations,
        "eval_elements_failed": eval_elements_failed,
        "top_regressed_rules": [],
        "first_broken_step": None,
        "replay": {
            "attempted": total_attempts,
            "succeeded": total_attempts - error_attempt_count,
            "failed": error_attempt_count,
            "avg_latency_ms": (sum(latencies) / len(latencies)) if latencies else None,
            "failed_snapshot_ids": [snapshot.id] if replay_error_messages else [],
            "error_messages": replay_error_messages,
            "error_codes": replay_error_codes,
            "missing_provider_keys": missing_provider_keys,
            "input_tokens_sum": sum_input_tokens if any_input_tokens else None,
            "output_tokens_sum": sum_output_tokens if any_output_tokens else None,
            "tokens_total_sum": sum_tokens_total if any_tokens_total else None,
            "used_credits_sum": sum_used_credits if any_used_credits else None,
        },
        "baseline_capture": baseline_capture_usage(snapshot),
        "attempts": attempts,
    }


def build_release_gate_final_payload(
    *,
    case_results: List[Dict[str, Any]],
    all_reasons: List[str],
    payload: Any,
    trace_id: str,
    baseline_trace_id: str,
    replay_request_meta: Dict[str, Any],
    tool_context_payload: Dict[str, Any] | None,
    perf_attempts: List[Dict[str, Any]],
    total_wall_ms: int,
    ratio_band: Callable[[float], str],
) -> Dict[str, Any]:
    total_cases = len(case_results)
    failed_cases = sum(1 for result in case_results if result.get("case_status") == "fail")
    flaky_cases = sum(1 for result in case_results if result.get("case_status") == "flaky")
    fail_rate = failed_cases / total_cases if total_cases else 0.0
    flaky_rate = flaky_cases / total_cases if total_cases else 0.0
    gate_pass = fail_rate <= payload.fail_rate_max and flaky_rate <= payload.flaky_rate_max
    primary_case = next((result for result in case_results if result.get("case_status") != "pass"), case_results[0])
    primary_summary = dict(primary_case.get("summary", {}))
    primary_summary["target"] = {
        "type": "release_gate_snapshot",
        "trace_id": primary_case.get("trace_id") or trace_id,
        "baseline_trace_id": baseline_trace_id,
        "snapshot_id": primary_case.get("snapshot_id"),
    }
    avg_attempt_wall_ms = (
        (sum(int(attempt.get("batch_wall_ms") or 0) for attempt in perf_attempts) / len(perf_attempts))
        if perf_attempts
        else None
    )
    total_attempts = sum(len(result.get("attempts") or []) for result in case_results)
    passed_attempts = sum(
        sum(1 for attempt in (result.get("attempts") or []) if attempt.get("pass"))
        for result in case_results
    )
    primary_summary["release_gate"] = {
        "mode": "replay_test",
        "repeat_runs": payload.repeat_runs,
        "total_inputs": total_cases,
        "failed_inputs": failed_cases,
        "flaky_inputs": flaky_cases,
        "passed_attempts": passed_attempts,
        "total_attempts": total_attempts,
        "fail_rate": round(fail_rate, 4),
        "flaky_rate": round(flaky_rate, 4),
        "ratio_band": ratio_band(fail_rate),
        "thresholds": {
            "fail_rate_max": payload.fail_rate_max,
            "flaky_rate_max": payload.flaky_rate_max,
        },
        "perf": {
            "total_wall_ms": total_wall_ms,
            "avg_attempt_wall_ms": avg_attempt_wall_ms,
        },
        "experiment": {
            "tool_context": tool_context_payload,
            "storage_policy": {"full_text_in_report": True},
        },
        "case_results": case_results,
        "replay_request_meta": replay_request_meta,
    }

    unique_reasons = list(dict.fromkeys(all_reasons))
    replay_error_codes_global = list(
        dict.fromkeys(
            code
            for result in case_results
            for code in ((result.get("replay") or {}).get("error_codes") or [])
            if code
        )
    )
    missing_provider_keys_global = list(
        dict.fromkeys(
            provider
            for result in case_results
            for provider in ((result.get("replay") or {}).get("missing_provider_keys") or [])
            if provider
        )
    )
    failed_signals = list(
        dict.fromkeys(
            signal
            for result in case_results
            for attempt in (result.get("attempts") or [])
            for signal in (((attempt.get("signals") or {}).get("failed")) or [])
            if signal
        )
    )
    threshold_text = (
        f"fail<={int(payload.fail_rate_max * 100)}%, flaky<={int(payload.flaky_rate_max * 100)}%"
    )

    return {
        "gate_pass": gate_pass,
        "primary_case": primary_case,
        "primary_summary": primary_summary,
        "response_payload": {
            "pass": gate_pass,
            "summary": (
                "Passed"
                if gate_pass
                else (
                    f"Failed: fail_rate={fail_rate:.2%}, flaky_rate={flaky_rate:.2%} "
                    f"exceed thresholds ({threshold_text})"
                )
            ),
            "failed_signals": failed_signals,
            "exit_code": 0 if gate_pass else 1,
            "report_id": None,
            "trace_id": primary_case.get("trace_id") or trace_id,
            "baseline_trace_id": baseline_trace_id,
            "failure_reasons": unique_reasons if not gate_pass else [],
            "thresholds_used": {
                "fail_rate_max": payload.fail_rate_max,
                "flaky_rate_max": payload.flaky_rate_max,
            },
            "fail_rate": round(fail_rate, 4),
            "flaky_rate": round(flaky_rate, 4),
            "failed_inputs": failed_cases,
            "flaky_inputs": flaky_cases,
            "total_inputs": total_cases,
            "repeat_runs": payload.repeat_runs,
            "perf": {
                "total_wall_ms": total_wall_ms,
                "avg_attempt_wall_ms": avg_attempt_wall_ms,
                "attempts": perf_attempts,
            },
            "replay_error_codes": replay_error_codes_global,
            "missing_provider_keys": missing_provider_keys_global,
            "experiment": {
                "tool_context": tool_context_payload,
                "storage_policy": {"full_text_in_report": True},
            },
            "replay_request_meta": replay_request_meta,
            "case_results": case_results,
            "evidence_pack": {
                "top_regressed_rules": [],
                "first_violations": (primary_case.get("violations") or [])[:5],
                "failed_replay_snapshot_ids": (
                    (primary_case.get("replay") or {}).get("failed_snapshot_ids") or []
                ),
                "sample_failure_reasons": unique_reasons[:5],
            },
        },
    }
