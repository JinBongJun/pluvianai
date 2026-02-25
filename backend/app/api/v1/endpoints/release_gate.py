"""
Release Gate endpoints.

MVP flow:
1) Use fixed production trace inputs
2) Replay with optional model/system prompt override
3) Validate behavior policies against baseline trace
4) Return CI-friendly pass/fail result + evidence

Baseline vs Run eval:
- Baseline snapshots show eval result from snapshot capture time (eval_checks_result).
  Do not re-evaluate baseline with current config here; that would be drift.
- Run result is evaluated with current agent + current eval config; it is the source
  of truth for "pass/fail with current setup".
- Drift mode is for comparing "at capture" vs "re-evaluated with current eval".
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.api.v1.endpoints.behavior import (
    _append_violation_context,
    _build_ruleset_hash,
    _build_trace_steps,
    _derive_agent_id,
    _extract_tool_calls_from_payload,
    _iso,
    _parse_tool_args,
    _resolve_effective_rules,
    _run_behavior_validation,
)
from app.utils.tool_calls import extract_tool_calls_summary
from app.core.database import get_db
from app.core.permissions import check_project_access
from app.core.security import get_current_user, get_user_from_api_key
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.behavior_report import BehaviorReport
from app.models.behavior_rule import BehaviorRule
from app.models.snapshot import Snapshot
from app.models.user import User
from app.models.validation_dataset import ValidationDataset
from app.services.replay_service import replay_service

router = APIRouter()


class ReleaseGateValidateRequest(BaseModel):
    agent_id: Optional[str] = Field(
        None, description="Agent (node) to validate. Use with use_recent_snapshots or dataset_id."
    )
    use_recent_snapshots: bool = Field(
        False, description="If True, use recent snapshots for agent_id instead of trace_id/dataset_id."
    )
    recent_snapshot_limit: int = Field(
        20,
        ge=1,
        le=400,
        description="Max recent snapshots when use_recent_snapshots=True.",
    )
    trace_id: Optional[str] = Field(None, description="Target trace ID. Optional if dataset_id or use_recent_snapshots.")
    dataset_id: Optional[str] = Field(
        None, description="Deprecated. Use dataset_ids."
    )
    dataset_ids: Optional[List[str]] = Field(
        None, description="List of validation dataset IDs. Resolves snapshots from all datasets."
    )
    snapshot_ids: Optional[List[str]] = Field(
        None,
        description="Explicit snapshot IDs to use (e.g. from Live View log picker). When set, these are used instead of dataset_ids / use_recent_snapshots.",
    )
    baseline_trace_id: Optional[str] = Field(
        None, description="Optional baseline trace ID. Defaults to trace_id or first snapshot's trace."
    )
    new_model: Optional[str] = Field(None, description="Replay model override")
    new_system_prompt: Optional[str] = Field(None, description="Replay system prompt override")
    replay_temperature: Optional[float] = Field(None, description="Replay request temperature override")
    replay_max_tokens: Optional[int] = Field(None, description="Replay request max_tokens override")
    replay_top_p: Optional[float] = Field(None, description="Replay request top_p override")
    replay_overrides: Optional[Dict[str, Any]] = Field(
        None, description="Optional dict merged into replay request body (e.g. tools, extra params)"
    )
    rule_ids: Optional[List[str]] = Field(None, description="Optional specific rule IDs")
    max_snapshots: int = Field(20, ge=1, le=100, description="Max snapshots replayed from trace")
    repeat_runs: int = Field(1, ge=1, le=5, description="Repeat replay N times")
    failed_run_ratio_max: float = Field(
        0.25,
        ge=0.0,
        le=1.0,
        description=(
            "Gate passes if (failed runs) / (total runs) <= this value. "
            "A run is 'failed' when it has at least one failed eval element (same as Live View red). "
            "E.g. 0.25 = pass when at most 25% of runs have any failure."
        ),
    )
    thresholds: Optional[Dict[str, int]] = Field(
        default=None,
        description="Deprecated. Ignored. Gate uses failed_run_ratio_max only. Will be removed in a future version.",
    )
    fail_on_any_regression: Optional[bool] = Field(
        default=None,
        description="Deprecated. Ignored. Gate uses failed_run_ratio_max only. Will be removed in a future version.",
    )
    evaluation_mode: Literal["regression", "stability", "drift"] = Field(
        "regression",
        description="Regression: baseline vs candidate. Drift: re-eval past data with current rules. Stability: N runs consistency (coming soon).",
    )


def _iso(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    try:
        return value.isoformat()
    except Exception:
        return None


def _compute_severity_delta(candidate: Dict[str, int], baseline: Dict[str, int]) -> Dict[str, int]:
    return {
        "critical": candidate.get("critical", 0) - baseline.get("critical", 0),
        "high": candidate.get("high", 0) - baseline.get("high", 0),
        "medium": candidate.get("medium", 0) - baseline.get("medium", 0),
        "low": candidate.get("low", 0) - baseline.get("low", 0),
    }


def _ratio_band(ratio: float) -> str:
    """Return band label for failed-run ratio (0-25%, 25-50%, 50-75%, 75-100%)."""
    if ratio <= 0.25:
        return "0-25%"
    if ratio <= 0.50:
        return "25-50%"
    if ratio <= 0.75:
        return "50-75%"
    return "75-100%"


def _build_replay_candidate_steps(
    snapshots: List[Snapshot], replay_results: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    by_snapshot_id = {s.id: s for s in snapshots}
    steps: List[Dict[str, Any]] = []

    for idx, res in enumerate(replay_results, start=1):
        snapshot = by_snapshot_id.get(res.get("snapshot_id"))
        if not snapshot:
            continue

        order = float(idx)
        base = {
            "step_order": order,
            "agent_id": snapshot.agent_id,
            "source_id": f"{snapshot.id}:release_replay",
            "source_type": "release_gate_replay",
            "signal_result": {},
            "latency_ms": res.get("latency_ms"),
        }
        steps.append(
            {
                **base,
                "step_type": "llm_call" if res.get("success") else "error",
                "tool_name": None,
                "tool_args": {
                    "status_code": res.get("status_code"),
                    "original_model": res.get("original_model"),
                    "replay_model": res.get("replay_model"),
                    "error": res.get("error"),
                },
            }
        )

        if not res.get("success"):
            continue

        tool_calls = _extract_tool_calls_from_payload(res.get("response_data"))
        for tc in tool_calls:
            function = tc.get("function") if isinstance(tc, dict) else {}
            function = function if isinstance(function, dict) else {}
            steps.append(
                {
                    **base,
                    "step_order": order + 0.01,
                    "step_type": "tool_call",
                    "tool_name": function.get("name") or tc.get("name"),
                    "tool_args": _parse_tool_args(function.get("arguments") or tc.get("arguments")),
                }
            )

    return sorted(steps, key=lambda x: x.get("step_order") or 0)


def _eval_elements_passed_failed(
    rules: List[BehaviorRule],
    violations: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Split rules into passed (no violation) and failed (has violations)."""
    violated_rule_ids: Set[str] = set()
    violation_counts: Dict[str, int] = {}
    for v in violations:
        rid = str(v.get("rule_id") or "")
        if rid:
            violated_rule_ids.add(rid)
            violation_counts[rid] = violation_counts.get(rid, 0) + 1
    passed = [
        {"rule_id": r.id, "rule_name": r.name or "Unknown"}
        for r in rules
        if r.id not in violated_rule_ids
    ]
    failed = [
        {
            "rule_id": r.id,
            "rule_name": r.name or "Unknown",
            "violation_count": violation_counts.get(r.id, 0),
        }
        for r in rules
        if r.id in violated_rule_ids
    ]
    return passed, failed


def _top_regressed_rules(
    rules: List[BehaviorRule],
    baseline_violations: List[Dict[str, Any]],
    candidate_violations: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    baseline_counts: Dict[str, int] = {}
    candidate_counts: Dict[str, int] = {}

    for v in baseline_violations:
        rule_id = str(v.get("rule_id") or "")
        if rule_id:
            baseline_counts[rule_id] = baseline_counts.get(rule_id, 0) + 1

    for v in candidate_violations:
        rule_id = str(v.get("rule_id") or "")
        if rule_id:
            candidate_counts[rule_id] = candidate_counts.get(rule_id, 0) + 1

    out: List[Dict[str, Any]] = []
    for rule_id, candidate_count in candidate_counts.items():
        baseline_count = baseline_counts.get(rule_id, 0)
        if candidate_count > baseline_count:
            rule = next((r for r in rules if r.id == rule_id), None)
            out.append(
                {
                    "rule_id": rule_id,
                    "rule_name": rule.name if rule else "Unknown",
                    "baseline_violations": baseline_count,
                    "candidate_violations": candidate_count,
                    "delta": candidate_count - baseline_count,
                }
            )
    out.sort(key=lambda row: row["delta"], reverse=True)
    return out


def _parse_snapshot_ids(raw: Optional[List[str]]) -> List[int]:
    if not raw:
        return []
    out = []
    for x in raw:
        if x is None:
            continue
        s = str(x).strip()
        if not s:
            continue
        try:
            out.append(int(s))
        except (ValueError, TypeError):
            continue
    return out


async def _run_release_gate(
    project_id: int, payload: ReleaseGateValidateRequest, db: Session
) -> Dict[str, Any]:
    trace_id = payload.trace_id
    baseline_trace_id = payload.baseline_trace_id
    snapshot_ids_to_use: Optional[List[Any]] = None
    target_dataset_ids: List[str] = list(payload.dataset_ids or []) or (
        [payload.dataset_id] if payload.dataset_id else []
    )

    if payload.snapshot_ids:
        snapshot_ids_to_use = _parse_snapshot_ids(payload.snapshot_ids)
        if not snapshot_ids_to_use:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="snapshot_ids must be a non-empty list of snapshot IDs when provided.",
            )
        first_snap = (
            db.query(Snapshot)
            .filter(
                Snapshot.project_id == project_id,
                Snapshot.id == snapshot_ids_to_use[0],
            )
            .first()
        )
        if first_snap:
            trace_id = first_snap.trace_id
            baseline_trace_id = baseline_trace_id or trace_id

    elif payload.use_recent_snapshots and payload.agent_id:
        recent_snapshots = (
            db.query(Snapshot)
            .filter(
                Snapshot.project_id == project_id,
                Snapshot.agent_id == payload.agent_id,
            )
            .order_by(Snapshot.created_at.desc())
            .limit(payload.recent_snapshot_limit)
            .all()
        )
        if not recent_snapshots:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No recent snapshots found for agent {payload.agent_id}",
            )
        trace_id = recent_snapshots[0].trace_id
        baseline_trace_id = baseline_trace_id or trace_id
        snapshot_ids_to_use = [s.id for s in recent_snapshots]

    elif target_dataset_ids:
        snapshot_ids_to_use = []
        datasets = (
            db.query(ValidationDataset)
            .filter(
                ValidationDataset.project_id == project_id,
                ValidationDataset.id.in_(target_dataset_ids),
            )
            .all()
        )
        if not datasets:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No validation datasets found for IDs {target_dataset_ids}",
            )
        for ds in datasets:
            if ds.snapshot_ids:
                snapshot_ids_to_use.extend(ds.snapshot_ids)
        
        # Determine fallback trace_id from the first dataset for reference
        if datasets and not trace_id:
            ds = datasets[0]
            if ds.trace_ids and len(ds.trace_ids) > 0:
                trace_id = ds.trace_ids[0]
            elif ds.snapshot_ids:
                first_snap = (
                    db.query(Snapshot)
                    .filter(
                        Snapshot.project_id == project_id,
                        Snapshot.id == ds.snapshot_ids[0],
                    )
                    .first()
                )
                if first_snap:
                    trace_id = first_snap.trace_id
        
        if not baseline_trace_id and trace_id:
            baseline_trace_id = trace_id

    if not trace_id and not snapshot_ids_to_use and not payload.use_recent_snapshots:
        # If we have snapshots but no trace_id (e.g. dataset only had snapshots), we might still be okay for Drift
        # provided Drift logic iterates snapshots/traces correctly.
        # But existing logic requires trace_id often. Let's see if we can derive it.
        pass

    if (not snapshot_ids_to_use) and (not payload.trace_id) and (not payload.use_recent_snapshots):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="trace_id, dataset_ids, snapshot_ids, or (use_recent_snapshots + agent_id) is required.",
        )
    baseline_trace_id = baseline_trace_id or trace_id

    if snapshot_ids_to_use:
        snapshots_by_id = {
            s.id: s
            for s in db.query(Snapshot)
            .filter(
                Snapshot.project_id == project_id,
                Snapshot.id.in_(snapshot_ids_to_use),
            )
            .all()
        }
        snapshots = [snapshots_by_id[sid] for sid in snapshot_ids_to_use if sid in snapshots_by_id]
        snapshots = snapshots[: payload.max_snapshots]
    else:
        snapshots = (
            db.query(Snapshot)
            .filter(Snapshot.project_id == project_id, Snapshot.trace_id == trace_id)
            .order_by(Snapshot.span_order.asc().nullslast(), Snapshot.created_at.asc())
            .limit(payload.max_snapshots)
            .all()
        )
    if not snapshots:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No snapshots found for trace_id={trace_id}",
        )

    baseline_steps = _build_trace_steps(project_id, baseline_trace_id, db)
    if not baseline_steps:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No baseline steps found for trace_id={baseline_trace_id}",
        )

    rules_query = db.query(BehaviorRule).filter(BehaviorRule.project_id == project_id)
    if payload.rule_ids:
        rules_query = rules_query.filter(BehaviorRule.id.in_(payload.rule_ids))
    else:
        rules_query = rules_query.filter(BehaviorRule.enabled.is_(True))
    rules = rules_query.order_by(BehaviorRule.created_at.asc()).all()

    baseline_rules, baseline_policy_resolution = _resolve_effective_rules(rules, baseline_steps)
    _baseline_status, baseline_summary, baseline_violations = _run_behavior_validation(
        baseline_rules, baseline_steps
    )
    baseline_summary["policy_resolution"] = baseline_policy_resolution
    baseline_summary["ruleset_hash"] = _build_ruleset_hash(baseline_rules)
    baseline_summary["rule_snapshot"] = [
        {"id": r.id, "revision": _iso(r.updated_at), "rule_json": r.rule_json or {}}
        for r in baseline_rules
    ]
    baseline_severity = baseline_summary.get("severity_breakdown", {})

    # Drift: re-evaluate recorded data with current rules (no replay). Support multiple traces from dataset.
    if payload.evaluation_mode == "drift":
        drift_runs: List[Dict[str, Any]] = []
        all_trace_ids: List[str] = []

        if (target_dataset_ids or payload.use_recent_snapshots) and snapshot_ids_to_use:
            # Multiple traces: get unique trace_ids from dataset snapshots.
            snapshots_for_traces = (
                db.query(Snapshot.trace_id)
                .filter(
                    Snapshot.project_id == project_id,
                    Snapshot.id.in_(snapshot_ids_to_use),
                )
                .distinct()
                .all()
            )
            all_trace_ids = [row.trace_id for row in snapshots_for_traces if row.trace_id]
        else:
            all_trace_ids = [trace_id]

        for run_idx, tid in enumerate(all_trace_ids, start=1):
            steps_for_trace = _build_trace_steps(project_id, tid, db)
            if not steps_for_trace:
                continue
            tr_rules, tr_policy_resolution = _resolve_effective_rules(rules, steps_for_trace)
            _tr_status, tr_summary, tr_violations = _run_behavior_validation(tr_rules, steps_for_trace)
            tr_enriched = _append_violation_context(tr_violations, steps_for_trace)
            tr_passed, tr_failed = _eval_elements_passed_failed(tr_rules, tr_violations)
            run_pass = len(tr_violations) == 0
            tr_reasons = [f"{len(tr_failed)} eval element(s) failed"] if not run_pass else []
            drift_runs.append(
                {
                    "run_index": run_idx,
                    "trace_id": tid,
                    "pass": run_pass,
                    "failure_reasons": tr_reasons,
                    "violations": tr_enriched,
                    "summary": {
                        **tr_summary,
                        "policy_resolution": tr_policy_resolution,
                        "ruleset_hash": _build_ruleset_hash(tr_rules),
                    },
                    "eval_elements_passed": tr_passed,
                    "eval_elements_failed": tr_failed,
                }
            )

        if not drift_runs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No trace data found to run Drift.",
            )

        total_runs = len(drift_runs)
        failed_runs_count = sum(1 for r in drift_runs if not r.get("pass"))
        failed_ratio = failed_runs_count / total_runs if total_runs else 0.0
        ratio_band = _ratio_band(failed_ratio)
        gate_pass = failed_ratio <= payload.failed_run_ratio_max

        primary_drift = next((r for r in drift_runs if not r.get("pass")), drift_runs[0])
        primary_summary = dict(primary_drift.get("summary", {}))
        primary_summary["target"] = {
            "type": "release_gate_trace",
            "trace_id": all_trace_ids[0] if all_trace_ids else trace_id,
            "baseline_trace_id": baseline_trace_id,
        }
        primary_summary["release_gate"] = {
            "mode": "drift",
            "repeat_runs": total_runs,
            "passed_runs": total_runs - failed_runs_count,
            "failed_runs": failed_runs_count,
            "failed_run_ratio": round(failed_ratio, 4),
            "ratio_band": ratio_band,
            "failed_run_ratio_max": payload.failed_run_ratio_max,
            "drift_runs": drift_runs,
        }
        report = BehaviorReport(
            project_id=project_id,
            trace_id=all_trace_ids[0] if all_trace_ids else trace_id,
            agent_id=_derive_agent_id(baseline_steps),
            baseline_run_ref=baseline_trace_id,
            ruleset_hash=primary_summary.get("ruleset_hash"),
            status="pass" if gate_pass else "fail",
            summary_json=primary_summary,
            violations_json=primary_drift.get("violations") or [],
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        unique_reasons = list(dict.fromkeys(r for run in drift_runs for r in run.get("failure_reasons", [])))
        failed_signals = list(dict.fromkeys(
            v.get("rule_id") for run in drift_runs for v in (run.get("violations") or []) if v.get("rule_id")
        ))
        return {
            "pass": gate_pass,
            "summary": "Passed" if gate_pass else f"Failed: {failed_runs_count}/{total_runs} runs ({ratio_band}) exceed threshold {int(payload.failed_run_ratio_max * 100)}%",
            "failed_signals": failed_signals,
            "exit_code": 0 if gate_pass else 1,
            "report_id": report.id,
            "trace_id": all_trace_ids[0] if all_trace_ids else trace_id,
            "baseline_trace_id": baseline_trace_id,
            "failure_reasons": unique_reasons if not gate_pass else [],
            "thresholds_used": {"failed_run_ratio_max": payload.failed_run_ratio_max},
            "failed_run_ratio": round(failed_ratio, 4),
            "ratio_band": ratio_band,
            "repeat_runs": total_runs,
            "drift_runs": drift_runs,
            "run_results": [
                {
                    "run_index": r.get("run_index"),
                    "pass": r.get("pass"),
                    "failure_reasons": r.get("failure_reasons", []),
                    "violation_count_delta": 0,
                    "severity_delta": {"critical": 0, "high": 0, "medium": 0, "low": 0},
                    "summary": r.get("summary"),
                    "violations": r.get("violations", []),
                    "eval_elements_passed": r.get("eval_elements_passed", []),
                    "eval_elements_failed": r.get("eval_elements_failed", []),
                    "top_regressed_rules": [],
                    "first_broken_step": None,
                    "replay": {"attempted": 0, "succeeded": 0, "failed": 0, "avg_latency_ms": None, "failed_snapshot_ids": []},
                    "has_tool_calls": False,
                    "tool_calls_summary": [],
                }
                for r in drift_runs
            ],
            "evidence_pack": {
                "top_regressed_rules": [],
                "first_violations": (primary_drift.get("violations") or [])[:5],
                "failed_replay_snapshot_ids": [],
                "sample_failure_reasons": unique_reasons[:5],
            },
        }

    run_results: List[Dict[str, Any]] = []
    all_reasons: List[str] = []

    for run_idx in range(payload.repeat_runs):
        replay_results = await replay_service.run_batch_replay(
            snapshots=snapshots,
            new_model=payload.new_model,
            new_system_prompt=payload.new_system_prompt,
            temperature=payload.replay_temperature,
            max_tokens=payload.replay_max_tokens,
            top_p=payload.replay_top_p,
            replay_overrides=payload.replay_overrides,
            rubric=None,
            project_id=None,
            db=None,
        )

        candidate_steps = _build_replay_candidate_steps(snapshots, replay_results)
        if not candidate_steps:
            _tool_summary = []
            for r in replay_results:
                _tool_summary.extend(extract_tool_calls_summary(r.get("response_data") or {}))
            reason = "Replay produced no candidate steps"
            run_results.append(
                {
                    "run_index": run_idx + 1,
                    "pass": False,
                    "failure_reasons": [reason],
                    "violation_count_delta": 0,
                    "severity_delta": {"critical": 0, "high": 0, "medium": 0, "low": 0},
                    "summary": {},
                    "violations": [],
                    "top_regressed_rules": [],
                    "first_broken_step": None,
                    "replay": {
                        "attempted": len(replay_results),
                        "succeeded": 0,
                        "failed": len(replay_results),
                        "avg_latency_ms": None,
                        "failed_snapshot_ids": [r.get("snapshot_id") for r in replay_results],
                    },
                    "has_tool_calls": len(_tool_summary) > 0,
                    "tool_calls_summary": _tool_summary,
                }
            )
            all_reasons.append(reason)
            continue

        candidate_rules, candidate_policy_resolution = _resolve_effective_rules(rules, candidate_steps)
        _candidate_status, candidate_summary, candidate_violations = _run_behavior_validation(
            candidate_rules, candidate_steps
        )
        candidate_summary["policy_resolution"] = candidate_policy_resolution
        candidate_summary["ruleset_hash"] = _build_ruleset_hash(candidate_rules)
        candidate_summary["rule_snapshot"] = [
            {"id": r.id, "revision": _iso(r.updated_at), "rule_json": r.rule_json or {}}
            for r in candidate_rules
        ]

        run_pass = len(candidate_violations) == 0
        reasons = [f"{len(candidate_violations)} eval element(s) failed"] if not run_pass else []

        enriched_violations = _append_violation_context(candidate_violations, candidate_steps)
        regressed_rules = _top_regressed_rules(rules, baseline_violations, candidate_violations)[:10]
        severity_delta = _compute_severity_delta(
            candidate_summary.get("severity_breakdown", {}),
            baseline_severity,
        )
        violation_count_delta = (
            candidate_summary.get("violation_count", 0) - baseline_summary.get("violation_count", 0)
        )

        baseline_step_refs = {
            float(v.get("step_ref", 0))
            for v in baseline_violations
            if v.get("step_ref") is not None
        }
        candidate_step_refs = {
            float(v.get("step_ref", 0))
            for v in candidate_violations
            if v.get("step_ref") is not None
        }
        new_violation_steps = sorted(candidate_step_refs - baseline_step_refs)
        first_broken_step = new_violation_steps[0] if new_violation_steps else None

        replay_success = [r for r in replay_results if r.get("success")]
        replay_failed = [r for r in replay_results if not r.get("success")]
        avg_latency_ms = (
            sum(float(r.get("latency_ms") or 0) for r in replay_success) / len(replay_success)
            if replay_success
            else None
        )
        run_tool_summary: List[Dict[str, Any]] = []
        for r in replay_results:
            run_tool_summary.extend(extract_tool_calls_summary(r.get("response_data") or {}))

        run_results.append(
            {
                "run_index": run_idx + 1,
                "pass": run_pass,
                "failure_reasons": reasons,
                "violation_count_delta": violation_count_delta,
                "severity_delta": severity_delta,
                "summary": candidate_summary,
                "violations": enriched_violations,
                "top_regressed_rules": regressed_rules,
                "first_broken_step": first_broken_step,
                "replay": {
                    "attempted": len(replay_results),
                    "succeeded": len(replay_success),
                    "failed": len(replay_failed),
                    "avg_latency_ms": avg_latency_ms,
                    "failed_snapshot_ids": [r.get("snapshot_id") for r in replay_failed],
                },
                "has_tool_calls": len(run_tool_summary) > 0,
                "tool_calls_summary": run_tool_summary,
            }
        )
        all_reasons.extend(reasons)

    total_runs = len(run_results)
    failed_runs_count = sum(1 for r in run_results if not r.get("pass"))
    failed_ratio = failed_runs_count / total_runs if total_runs else 0.0
    ratio_band = _ratio_band(failed_ratio)
    gate_pass = failed_ratio <= payload.failed_run_ratio_max

    failing_runs = [r for r in run_results if not r.get("pass")]
    primary_run = failing_runs[0] if failing_runs else run_results[0]
    primary_summary = primary_run.get("summary")
    if not isinstance(primary_summary, dict):
        primary_summary = {}
    primary_summary["target"] = {
        "type": "release_gate_trace",
        "trace_id": trace_id,
        "baseline_trace_id": baseline_trace_id,
    }
    primary_summary["release_gate"] = {
        "mode": payload.evaluation_mode,
        "repeat_runs": total_runs,
        "passed_runs": total_runs - failed_runs_count,
        "failed_runs": failed_runs_count,
        "failed_run_ratio": round(failed_ratio, 4),
        "ratio_band": ratio_band,
        "failed_run_ratio_max": payload.failed_run_ratio_max,
        "model_override": payload.new_model,
        "system_prompt_override": bool(payload.new_system_prompt),
    }

    report = BehaviorReport(
        project_id=project_id,
        trace_id=trace_id,
        agent_id=_derive_agent_id(baseline_steps),
        baseline_run_ref=baseline_trace_id,
        ruleset_hash=primary_summary.get("ruleset_hash"),
        status="pass" if gate_pass else "fail",
        summary_json=primary_summary,
        violations_json=primary_run.get("violations") or [],
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    unique_reasons = list(dict.fromkeys(all_reasons))
    evidence_pack = {
        "top_regressed_rules": primary_run.get("top_regressed_rules") or [],
        "first_violations": (primary_run.get("violations") or [])[:5],
        "failed_replay_snapshot_ids": (primary_run.get("replay") or {}).get("failed_snapshot_ids") or [],
        "sample_failure_reasons": unique_reasons[:5],
    }
    top_regressed = primary_run.get("top_regressed_rules") or []
    violations = primary_run.get("violations") or []
    failed_signals = list(
        dict.fromkeys(
            [r.get("rule_id") for r in top_regressed if r.get("rule_id")]
            + [v.get("rule_id") for v in violations if v.get("rule_id")]
        )
    )
    if gate_pass:
        summary = "Passed"
    else:
        summary = f"Failed: {failed_runs_count}/{total_runs} runs ({ratio_band}) exceed threshold {int(payload.failed_run_ratio_max * 100)}%"

    return {
        "pass": gate_pass,
        "summary": summary,
        "failed_signals": failed_signals,
        "exit_code": 0 if gate_pass else 1,
        "report_id": report.id,
        "trace_id": trace_id,
        "baseline_trace_id": baseline_trace_id,
        "failure_reasons": unique_reasons if not gate_pass else [],
        "thresholds_used": {"failed_run_ratio_max": payload.failed_run_ratio_max},
        "failed_run_ratio": round(failed_ratio, 4),
        "ratio_band": ratio_band,
        "repeat_runs": total_runs,
        "run_results": run_results,
        "evidence_pack": evidence_pack,
    }


@router.get("/projects/{project_id}/release-gate/agents")
def list_release_gate_agents(
    project_id: int,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List agents (nodes) for Release Gate dropdown: agent_id and display_name."""
    check_project_access(project_id, current_user, db)
    rows = (
        db.query(Snapshot.agent_id, func.max(Snapshot.created_at).label("last_seen"))
        .filter(Snapshot.project_id == project_id, Snapshot.agent_id.isnot(None))
        .group_by(Snapshot.agent_id)
        .order_by(desc("last_seen"))
        .limit(limit)
        .all()
    )
    agent_ids = [r.agent_id for r in rows if r.agent_id]
    if not agent_ids:
        return {"items": []}
    settings = (
        db.query(AgentDisplaySetting)
        .filter(
            AgentDisplaySetting.project_id == project_id,
            AgentDisplaySetting.system_prompt_hash.in_(agent_ids),
        )
        .all()
    )
    settings_map = {s.system_prompt_hash: s for s in settings}
    items = []
    for aid in agent_ids:
        s = settings_map.get(aid)
        display_name = (s.display_name if s and s.display_name else (aid or "Agent"))
        items.append({"agent_id": aid, "display_name": display_name})
    return {"items": items}


@router.get("/projects/{project_id}/release-gate/agents/{agent_id}/recent-snapshots")
def list_recent_snapshots_for_agent(
    project_id: int,
    agent_id: str,
    limit: int = Query(20, ge=1, le=400),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List recent snapshots for an agent (for Release Gate 'use recent snapshots' option)."""
    check_project_access(project_id, current_user, db)
    total_available = (
        db.query(func.count(Snapshot.id))
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id == agent_id,
        )
        .scalar()
        or 0
    )
    rows = (
        db.query(
            Snapshot.id,
            Snapshot.trace_id,
            Snapshot.created_at,
            Snapshot.model,
            Snapshot.system_prompt,
            Snapshot.payload,
            Snapshot.status_code,
            Snapshot.latency_ms,
            Snapshot.tokens_used,
            Snapshot.cost,
        )
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id == agent_id,
        )
        .order_by(Snapshot.created_at.desc())
        .limit(limit)
        .all()
    )
    items = [
        {
            "id": r.id,
            "trace_id": r.trace_id,
            "created_at": r.created_at,
            "model": r.model,
            "system_prompt": r.system_prompt,
            "payload": r.payload,
            "status_code": r.status_code,
            "latency_ms": r.latency_ms,
            "tokens_used": r.tokens_used,
            "cost": float(r.cost) if r.cost is not None else None,
        }
        for r in rows
    ]
    return {"items": items, "total": len(items), "total_available": total_available}


@router.post("/projects/{project_id}/release-gate/validate")
async def validate_release_gate(
    project_id: int,
    payload: ReleaseGateValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db)
    if payload.use_recent_snapshots and not payload.agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="agent_id is required when use_recent_snapshots is True",
        )
    return await _run_release_gate(project_id, payload, db)


@router.post("/projects/{project_id}/release-gate/webhook")
async def release_gate_webhook(
    project_id: int,
    payload: ReleaseGateValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_from_api_key),
):
    check_project_access(project_id, current_user, db)
    return await _run_release_gate(project_id, payload, db)


@router.get("/projects/{project_id}/release-gate/suggest-baseline")
async def suggest_release_gate_baseline(
    project_id: int,
    trace_id: str = Query(..., description="Current trace ID"),
    agent_id: Optional[str] = Query(None, description="Optional agent ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db)

    effective_agent = (agent_id or "").strip() or None
    if not effective_agent:
        latest_snapshot = (
            db.query(Snapshot)
            .filter(Snapshot.project_id == project_id, Snapshot.trace_id == trace_id)
            .order_by(Snapshot.created_at.desc())
            .first()
        )
        if latest_snapshot and latest_snapshot.agent_id:
            effective_agent = str(latest_snapshot.agent_id)

    reports_query = (
        db.query(BehaviorReport)
        .filter(
            BehaviorReport.project_id == project_id,
            BehaviorReport.status == "pass",
            BehaviorReport.trace_id.isnot(None),
            BehaviorReport.trace_id != trace_id,
        )
        .order_by(BehaviorReport.created_at.desc())
    )
    if effective_agent:
        reports_query = reports_query.filter(BehaviorReport.agent_id == effective_agent)

    report_rows = reports_query.limit(80).all()
    release_rows = [
        row
        for row in report_rows
        if isinstance(row.summary_json, dict) and isinstance(row.summary_json.get("release_gate"), dict)
    ]
    preferred = release_rows[0] if release_rows else (report_rows[0] if report_rows else None)
    if preferred:
        return {
            "baseline_trace_id": preferred.trace_id,
            "source": "behavior_report",
            "report_id": preferred.id,
            "agent_id": effective_agent,
            "created_at": _iso(preferred.created_at),
        }

    if effective_agent:
        rows = (
            db.query(Snapshot)
            .filter(
                Snapshot.project_id == project_id,
                Snapshot.agent_id == effective_agent,
                Snapshot.trace_id.isnot(None),
                Snapshot.trace_id != trace_id,
            )
            .order_by(Snapshot.created_at.desc())
            .limit(300)
            .all()
        )
        seen: Set[str] = set()
        for row in rows:
            candidate_trace_id = str(row.trace_id or "")
            if not candidate_trace_id or candidate_trace_id in seen:
                continue
            seen.add(candidate_trace_id)
            return {
                "baseline_trace_id": candidate_trace_id,
                "source": "snapshot_fallback",
                "agent_id": effective_agent,
                "created_at": _iso(row.created_at),
            }

    return {"baseline_trace_id": None, "source": None, "agent_id": effective_agent}


@router.get("/projects/{project_id}/release-gate/history")
async def list_release_gate_history(
    project_id: int,
    status_filter: Optional[str] = Query(None, alias="status", description="pass | fail"),
    trace_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db)

    query = (
        db.query(BehaviorReport)
        .filter(BehaviorReport.project_id == project_id, BehaviorReport.trace_id.isnot(None))
        .order_by(BehaviorReport.created_at.desc())
    )
    if status_filter in {"pass", "fail"}:
        query = query.filter(BehaviorReport.status == status_filter)
    if trace_id:
        query = query.filter(BehaviorReport.trace_id == trace_id)

    # Release-gate runs are marked in summary_json.release_gate.
    scan_limit = min(1000, max(200, (offset + limit) * 5))
    scanned = query.limit(scan_limit).all()
    rows = [
        row
        for row in scanned
        if isinstance(row.summary_json, dict) and isinstance(row.summary_json.get("release_gate"), dict)
    ]

    total = len(rows)
    page_rows = rows[offset : offset + limit]
    items: List[Dict[str, Any]] = []
    for row in page_rows:
        gate_meta = row.summary_json.get("release_gate") if isinstance(row.summary_json, dict) else {}
        items.append(
            {
                "id": row.id,
                "status": row.status,
                "trace_id": row.trace_id,
                "baseline_trace_id": row.baseline_run_ref,
                "agent_id": row.agent_id,
                "created_at": _iso(row.created_at),
                "mode": gate_meta.get("mode", "regression"),
                "repeat_runs": gate_meta.get("repeat_runs"),
                "passed_runs": gate_meta.get("passed_runs"),
                "failed_runs": gate_meta.get("failed_runs"),
                "thresholds": gate_meta.get("thresholds"),
            }
        )

    return {"items": items, "total": total, "limit": limit, "offset": offset}

