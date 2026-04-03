from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.behavior_report import BehaviorReport
from app.models.release_gate_run import ReleaseGateRun
from app.models.snapshot import Snapshot


def build_release_gate_history_session_result(
    report: BehaviorReport,
    gate_meta: Dict[str, Any],
    *,
    release_gate_history_status,
    coerce_optional_int,
) -> Dict[str, Any]:
    case_results = gate_meta.get("case_results")
    if not isinstance(case_results, list):
        case_results = []
    failure_reasons = gate_meta.get("failure_reasons")
    if not isinstance(failure_reasons, list):
        failure_reasons = []
    perf = gate_meta.get("perf")
    perf_payload = perf if isinstance(perf, dict) else None
    thresholds_used = gate_meta.get("thresholds_used")
    if not isinstance(thresholds_used, dict):
        thresholds_used = gate_meta.get("thresholds")
    if not isinstance(thresholds_used, dict):
        thresholds_used = {}
    evidence_pack = gate_meta.get("evidence_pack")
    if not isinstance(evidence_pack, dict):
        evidence_pack = {
            "top_regressed_rules": [],
            "first_violations": [],
            "failed_replay_snapshot_ids": [],
            "sample_failure_reasons": failure_reasons[:5],
        }
    primary_case = next(
        (case for case in case_results if isinstance(case, dict) and case.get("case_status") != "pass"),
        next((case for case in case_results if isinstance(case, dict)), {}),
    )
    report_status = release_gate_history_status(report.status)
    return {
        "pass": report_status == "pass",
        "summary": gate_meta.get("summary"),
        "experiment": gate_meta.get("experiment"),
        "replay_request_meta": gate_meta.get("replay_request_meta"),
        "failed_signals": gate_meta.get("failed_signals") or [],
        "exit_code": 0 if report_status == "pass" else 1,
        "report_id": report.id,
        "trace_id": str(primary_case.get("trace_id") or report.trace_id or ""),
        "baseline_trace_id": str(report.baseline_run_ref or ""),
        "failure_reasons": [str(reason) for reason in failure_reasons if str(reason).strip()],
        "thresholds_used": thresholds_used,
        "fail_rate": gate_meta.get("fail_rate"),
        "flaky_rate": gate_meta.get("flaky_rate"),
        "failed_inputs": gate_meta.get("failed_inputs"),
        "flaky_inputs": gate_meta.get("flaky_inputs"),
        "total_inputs": gate_meta.get("total_inputs"),
        "repeat_runs": coerce_optional_int(gate_meta.get("repeat_runs")) or 1,
        "perf": perf_payload,
        "replay_error_codes": gate_meta.get("replay_error_codes") or [],
        "missing_provider_keys": gate_meta.get("missing_provider_keys") or [],
        "case_results": case_results,
        "evidence_pack": evidence_pack,
    }


def resolve_release_gate_run_agent_id(db: Session, report: BehaviorReport) -> Optional[str]:
    normalized_agent_id = str(report.agent_id or "").strip() or None
    if normalized_agent_id:
        return normalized_agent_id
    trace_id = str(report.trace_id or "").strip()
    if not trace_id:
        return None
    latest_snapshot = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == report.project_id,
            Snapshot.trace_id == trace_id,
            Snapshot.is_deleted.is_(False),
            Snapshot.agent_id.isnot(None),
        )
        .order_by(Snapshot.created_at.desc())
        .first()
    )
    if latest_snapshot and latest_snapshot.agent_id:
        return str(latest_snapshot.agent_id).strip() or None
    return None


def build_release_gate_run_record(
    db: Session,
    report: BehaviorReport,
    *,
    release_gate_meta,
    coerce_optional_int,
) -> Optional[ReleaseGateRun]:
    gate_meta = release_gate_meta(report.summary_json)
    if not gate_meta:
        return None

    total_inputs = coerce_optional_int(gate_meta.get("total_inputs"))
    failed_inputs = coerce_optional_int(gate_meta.get("failed_inputs")) or 0
    flaky_inputs = coerce_optional_int(gate_meta.get("flaky_inputs")) or 0
    failed_runs = failed_inputs + flaky_inputs if total_inputs is not None else None
    passed_runs = (
        max(total_inputs - failed_runs, 0)
        if total_inputs is not None and failed_runs is not None
        else None
    )

    return ReleaseGateRun(
        report_id=report.id,
        project_id=report.project_id,
        trace_id=report.trace_id,
        baseline_trace_id=report.baseline_run_ref,
        agent_id=resolve_release_gate_run_agent_id(db, report),
        status=report.status,
        mode=str(gate_meta.get("mode") or "replay_test"),
        repeat_runs=coerce_optional_int(gate_meta.get("repeat_runs")),
        total_inputs=total_inputs,
        passed_runs=passed_runs,
        failed_runs=failed_runs,
        passed_attempts=coerce_optional_int(gate_meta.get("passed_attempts")),
        total_attempts=coerce_optional_int(gate_meta.get("total_attempts")),
        thresholds_json=gate_meta.get("thresholds"),
        created_at=report.created_at or datetime.now(timezone.utc),
    )
