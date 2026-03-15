"""
Behavior validation API endpoints.

MVP scope:
- CRUD for behavior rules
- list reports
- validate trace/test run and persist report
"""

from __future__ import annotations

import json
import csv
import hashlib
from io import StringIO
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.canonical import response_to_canonical_steps
from app.utils.tool_calls import normalize_tool_name
from app.core.database import get_db
from app.core.logging_config import logger
from app.core.permissions import ProjectRole, check_project_access
from app.core.security import get_current_user
from app.models.behavior_report import BehaviorReport
from app.models.behavior_rule import BehaviorRule
from app.models.trajectory_step import TrajectoryStep
from app.models.snapshot import Snapshot
from app.models.test_run import TestRun
from app.models.test_result import TestResult
from app.models.user import User
from app.models.validation_dataset import ValidationDataset
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.project import Project

router = APIRouter()


class BehaviorRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    scope_type: str = Field(default="project", description="project | agent | canvas")
    scope_ref: Optional[str] = None
    severity_default: Optional[str] = Field(None, description="low | medium | high | critical")
    rule_json: Dict[str, Any] = Field(..., description="Rule spec JSON")
    enabled: bool = True


class BehaviorRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    scope_type: Optional[str] = None
    scope_ref: Optional[str] = None
    severity_default: Optional[str] = None
    rule_json: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class BehaviorValidateRequest(BaseModel):
    trace_id: Optional[str] = None
    test_run_id: Optional[str] = None
    rule_ids: Optional[List[str]] = None
    baseline_run_ref: Optional[str] = None


class BehaviorCompareRequest(BaseModel):
    baseline_test_run_id: str = Field(..., description="Baseline test run ID")
    candidate_test_run_id: str = Field(..., description="Candidate test run ID to compare")
    rule_ids: Optional[List[str]] = Field(None, description="Optional: specific rule IDs to compare")


class CIGateRequest(BaseModel):
    baseline_test_run_id: Optional[str] = Field(None, description="Baseline test run ID (optional)")
    candidate_test_run_id: str = Field(..., description="Candidate test run ID to validate")
    rule_ids: Optional[List[str]] = Field(None, description="Optional: specific rule IDs to validate")
    thresholds: Dict[str, Any] = Field(
        default_factory=lambda: {},
        description="Thresholds: e.g., {'critical': 0, 'high': 2, 'medium': 10, 'low': 50}"
    )


class ValidationDatasetCreate(BaseModel):
    """Create a validation dataset from current run/selection."""

    trace_ids: Optional[List[str]] = Field(None, description="Trace IDs to include")
    snapshot_ids: Optional[List[int]] = Field(None, description="Snapshot IDs to include (alternative to trace_ids)")
    agent_id: Optional[str] = None
    label: Optional[str] = Field(None, max_length=200)
    tag: Optional[str] = Field(None, max_length=100)
    eval_config_snapshot: Optional[Dict[str, Any]] = Field(None, description="Eval config at save time")
    policy_ruleset_snapshot: Optional[List[Dict[str, Any]]] = Field(
        None, description="Rule snapshot: [{id, revision, rule_json}, ...]"
    )
    ruleset_hash: Optional[str] = None


class ValidationDatasetUpdate(BaseModel):
    """Update a validation dataset (e.g. snapshot_ids for removing one log)."""

    snapshot_ids: Optional[List[int]] = Field(None, description="New list of snapshot IDs (replaces existing)")
    label: Optional[str] = Field(None, max_length=200, description="Dataset label")


class BatchDeleteDatasetsRequest(BaseModel):
    """Request body for deleting multiple validation datasets in one call."""

    dataset_ids: List[str] = Field(..., min_length=1, max_length=100, description="IDs of datasets to delete")


class BatchCreateDatasetsRequest(BaseModel):
    """Request body for creating multiple validation datasets in one call."""

    items: List[ValidationDatasetCreate] = Field(..., min_length=1, max_length=50, description="One dataset spec per item")


def _normalize_agent_id(value: Optional[str]) -> Optional[str]:
    normalized = str(value or "").strip()
    return normalized or None


def _resolve_dataset_agent_id(
    *,
    project_id: int,
    snapshot_ids: Optional[List[int]],
    requested_agent_id: Optional[str],
    db: Session,
) -> Optional[str]:
    normalized_requested = _normalize_agent_id(requested_agent_id)
    if not snapshot_ids:
        return normalized_requested

    normalized_snapshot_ids = [int(sid) for sid in snapshot_ids if sid is not None]
    if not normalized_snapshot_ids:
        return normalized_requested

    rows = (
        db.query(Snapshot.id, Snapshot.agent_id)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(normalized_snapshot_ids),
        )
        .all()
    )
    found_ids = {int(row.id) for row in rows if row.id is not None}
    missing_ids = [sid for sid in normalized_snapshot_ids if sid not in found_ids]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown snapshot IDs: {missing_ids[:20]}",
        )

    snapshot_agent_ids = sorted(
        {
            str(row.agent_id).strip()
            for row in rows
            if str(row.agent_id or "").strip()
        }
    )
    if len(snapshot_agent_ids) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "dataset_agent_mismatch",
                "message": "A dataset can only contain logs from one node.",
                "agent_ids": snapshot_agent_ids,
            },
        )

    inferred_agent_id = snapshot_agent_ids[0] if snapshot_agent_ids else None
    if normalized_requested and inferred_agent_id and normalized_requested != inferred_agent_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "dataset_agent_mismatch",
                "message": "Provided agent_id does not match selected snapshot_ids.",
                "requested_agent_id": normalized_requested,
                "snapshot_agent_id": inferred_agent_id,
            },
        )
    return normalized_requested or inferred_agent_id


def _build_trace_steps(project_id: int, trace_id: str, db: Session) -> List[Dict[str, Any]]:
    rows = (
        db.query(Snapshot)
        .filter(Snapshot.project_id == project_id, Snapshot.trace_id == trace_id)
        .order_by(Snapshot.span_order.asc().nullslast(), Snapshot.created_at.asc())
        .all()
    )
    steps: List[Dict[str, Any]] = []
    for idx, s in enumerate(rows, start=1):
        base_step = {
            "step_order": s.span_order if s.span_order is not None else idx,
            "agent_id": s.agent_id,
            "source_id": s.id,
            "source_type": "snapshot",
            "signal_result": s.signal_result or {},
            "latency_ms": s.latency_ms,
        }
        canonical_steps = response_to_canonical_steps(
            s.payload,
            provider_hint=getattr(s, "provider", None),
            step_order_base=float(base_step["step_order"]),
            base_meta=base_step,
        )
        steps.extend(canonical_steps)
    return sorted(steps, key=lambda x: x.get("step_order") or 0)


def _build_run_steps(project_id: int, test_run_id: str, db: Session) -> List[Dict[str, Any]]:
    rows = (
        db.query(TestResult)
        .filter(TestResult.project_id == project_id, TestResult.test_run_id == test_run_id)
        .order_by(TestResult.step_order.asc().nullslast(), TestResult.created_at.asc())
        .all()
    )
    steps: List[Dict[str, Any]] = []
    for idx, r in enumerate(rows, start=1):
        steps.append(
            {
                "step_order": r.step_order if r.step_order is not None else idx,
                "agent_id": r.agent_id,
                "source_id": r.id,
                "source_type": "test_result",
                "step_type": "llm_call",
                "tool_name": None,
                "tool_args": {},
                "signal_result": r.signal_result or {},
                "response": r.response,
                "latency_ms": r.latency_ms,
            }
        )
        # Parse response as JSON and extract tool_call steps via canonical layer (multi-provider).
        response_text = r.response or ""
        if response_text and response_text.strip().startswith("{"):
            try:
                parsed = json.loads(response_text)
                base_meta = {
                    "agent_id": r.agent_id,
                    "source_id": r.id,
                    "source_type": "test_result",
                    "signal_result": r.signal_result or {},
                    "latency_ms": r.latency_ms,
                }
                canonical_steps = response_to_canonical_steps(
                    parsed,
                    provider_hint=None,
                    step_order_base=float(r.step_order if r.step_order is not None else idx),
                    base_meta=base_meta,
                )
                if canonical_steps:
                    first_canonical = canonical_steps[0]
                    if first_canonical.get("_provider_unknown"):
                        steps[-1]["_provider_unknown"] = True
                    if first_canonical.get("_id_conflict"):
                        steps[-1]["_id_conflict"] = True
                for st in canonical_steps:
                    if st.get("step_type") == "tool_call":
                        steps.append(st)
            except Exception:
                pass
    return sorted(steps, key=lambda x: x.get("step_order") or 0)


def _match_rule_scope(rule: BehaviorRule, steps: List[Dict[str, Any]]) -> bool:
    if rule.scope_type == "project":
        return True
    if rule.scope_type == "agent" and rule.scope_ref:
        return any(str(s.get("agent_id") or "") == str(rule.scope_ref) for s in steps)
    # canvas scope is currently only meaningful in run metadata; include for forward compatibility
    return True


def _normalize_rule_name(name: Optional[str]) -> str:
    return str(name or "").strip().lower()


def _rule_type(rule: BehaviorRule) -> str:
    rule_json = rule.rule_json or {}
    return str(rule_json.get("type") or "").strip().lower()


def _resolve_effective_rules(
    rules: List[BehaviorRule],
    steps: List[Dict[str, Any]],
) -> Tuple[List[BehaviorRule], Dict[str, Any]]:
    """
    Resolve effective policy rules for a specific validation target.

    Priority:
    - Project defaults always apply unless overridden.
    - Agent-scoped rules apply when the target contains that agent_id.
    - Agent overrides can shadow project defaults via rule_json.meta.override_mode:
      - additive (default): no shadowing
      - replace_same_name: replace project rules with same name+type
      - replace_same_type: replace all project rules of same type
    - Optional explicit shadowing:
      - rule_json.meta.override_project_rule_ids: [rule_id, ...]
      - rule_json.meta.override_project_rule_names: [rule_name, ...]
    """
    scoped_rules = [r for r in rules if r.enabled and _match_rule_scope(r, steps)]
    project_rules = [r for r in scoped_rules if str(r.scope_type or "project") == "project"]
    agent_rules = [r for r in scoped_rules if str(r.scope_type or "") == "agent"]
    other_rules = [r for r in scoped_rules if str(r.scope_type or "") not in {"project", "agent"}]

    remaining_project_rules = list(project_rules)
    override_events: List[Dict[str, Any]] = []

    for agent_rule in agent_rules:
        rule_json = agent_rule.rule_json if isinstance(agent_rule.rule_json, dict) else {}
        meta = rule_json.get("meta") if isinstance(rule_json.get("meta"), dict) else {}
        override_mode = str(meta.get("override_mode") or "additive").strip().lower()

        explicit_ids = {str(x) for x in (meta.get("override_project_rule_ids") or [])}
        explicit_names = {_normalize_rule_name(x) for x in (meta.get("override_project_rule_names") or [])}

        removed_ids: List[str] = []
        next_project_rules: List[BehaviorRule] = []
        for project_rule in remaining_project_rules:
            remove = False
            if project_rule.id in explicit_ids:
                remove = True
            if _normalize_rule_name(project_rule.name) in explicit_names and _normalize_rule_name(project_rule.name):
                remove = True

            same_type = _rule_type(project_rule) == _rule_type(agent_rule) and bool(_rule_type(project_rule))
            same_name_and_type = (
                _normalize_rule_name(project_rule.name) == _normalize_rule_name(agent_rule.name)
                and same_type
                and bool(_normalize_rule_name(project_rule.name))
            )

            if override_mode == "replace_same_name" and same_name_and_type:
                remove = True
            elif override_mode == "replace_same_type" and same_type:
                remove = True

            if remove:
                removed_ids.append(project_rule.id)
            else:
                next_project_rules.append(project_rule)

        remaining_project_rules = next_project_rules
        if removed_ids:
            override_events.append(
                {
                    "agent_rule_id": agent_rule.id,
                    "agent_id": agent_rule.scope_ref,
                    "override_mode": override_mode,
                    "shadowed_project_rule_ids": removed_ids,
                }
            )

    effective_rules = remaining_project_rules + agent_rules + other_rules
    resolution = {
        "project_defaults_total": len(project_rules),
        "agent_overrides_total": len(agent_rules),
        "effective_rule_count": len(effective_rules),
        "override_events": override_events,
    }
    return effective_rules, resolution


def _validate_tool_order(rule: BehaviorRule, spec: Dict[str, Any], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    pairs = (spec or {}).get("must_happen_before") or []
    tool_indices: Dict[str, List[float]] = {}
    for s in steps:
        t = s.get("tool_name")
        if not t:
            continue
        tool_indices.setdefault(str(t), []).append(float(s.get("step_order") or 0))

    for pair in pairs:
        tool = normalize_tool_name(pair.get("tool") or "")
        before_tool = normalize_tool_name(pair.get("before_tool") or "")
        if not tool or not before_tool:
            continue
        a = tool_indices.get(str(tool), [])
        b = tool_indices.get(str(before_tool), [])
        if not a or not b:
            continue
        if min(a) > min(b):
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "high",
                    "step_ref": min(b),
                    "message": f"'{tool}' must occur before '{before_tool}'",
                    "evidence": {"tool": tool, "before_tool": before_tool},
                }
            )
    return violations


def _validate_tool_forbidden(rule: BehaviorRule, spec: Dict[str, Any], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    forbidden = set(normalize_tool_name(t) for t in ((spec or {}).get("tools") or []))
    if not forbidden:
        return violations
    for s in steps:
        t = s.get("tool_name")
        if t and t in forbidden:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "critical",
                    "step_ref": s.get("step_order"),
                    "message": f"Forbidden tool used: {t}",
                    "evidence": {"tool": t, "args": s.get("tool_args", {})},
                }
            )
    return violations


def _validate_tool_allowlist(rule: BehaviorRule, spec: Dict[str, Any], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Fail if any tool call occurs that is not explicitly allowed.
    """
    violations: List[Dict[str, Any]] = []
    allowed = set(normalize_tool_name(t) for t in ((spec or {}).get("tools") or []))
    if not allowed:
        return violations
    for s in steps:
        t = s.get("tool_name")
        if not t:
            continue
        if t not in allowed:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "high",
                    "step_ref": s.get("step_order"),
                    "message": f"Tool not in allowlist: {t}",
                    "evidence": {"tool": t, "args": s.get("tool_args", {}), "allowed": sorted(list(allowed))},
                }
            )
    return violations


def _validate_tool_args_schema(rule: BehaviorRule, spec: Dict[str, Any], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    target_tool = normalize_tool_name((spec or {}).get("tool") or "")
    schema = (spec or {}).get("json_schema") or {}
    required = schema.get("required") or []
    additional_allowed = schema.get("additionalProperties", True)
    properties = schema.get("properties") or {}

    if not target_tool:
        return violations

    _RESERVED_KEYS = frozenset({"_raw", "_invalid", "_too_large"})

    for s in steps:
        if s.get("tool_name") != target_tool:
            continue
        args = s.get("tool_args") or {}
        if args.get("_too_large") is True:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "critical",
                    "step_ref": s.get("step_order"),
                    "message": "Tool arguments exceeded size limit",
                    "evidence": {"tool": target_tool},
                }
            )
            continue
        if args.get("_invalid") is True:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "critical",
                    "step_ref": s.get("step_order"),
                    "message": "Tool arguments could not be parsed (invalid JSON or non-dict)",
                    "evidence": {
                        "tool": target_tool,
                        "raw": args.get("_raw"),
                    },
                }
            )
            continue
        args_keys = {k for k in args.keys() if k not in _RESERVED_KEYS}
        missing = [k for k in required if k not in args]
        extras = [k for k in args_keys if k not in properties] if not additional_allowed else []
        if missing or extras:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "critical",
                    "step_ref": s.get("step_order"),
                    "message": "Tool args schema validation failed",
                    "evidence": {
                        "tool": target_tool,
                        "missing_fields": missing,
                        "extra_fields": extras,
                        "args": args,
                    },
                }
            )
    return violations


def _serialize_step(step: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not step:
        return None
    return {
        "step_order": step.get("step_order"),
        "step_type": step.get("step_type"),
        "agent_id": step.get("agent_id"),
        "tool_name": step.get("tool_name"),
        "tool_args": step.get("tool_args") or {},
        "source_type": step.get("source_type"),
        "source_id": step.get("source_id"),
    }


def _find_step_context(steps: List[Dict[str, Any]], step_ref: Any) -> Dict[str, Any]:
    if step_ref is None:
        return {"prev": None, "current": None, "next": None}
    target = float(step_ref)
    idx = next(
        (i for i, s in enumerate(steps) if float(s.get("step_order") or 0) == target),
        None,
    )
    if idx is None:
        return {"prev": None, "current": None, "next": None}
    prev_step = steps[idx - 1] if idx > 0 else None
    current_step = steps[idx]
    next_step = steps[idx + 1] if idx + 1 < len(steps) else None
    return {
        "prev": _serialize_step(prev_step),
        "current": _serialize_step(current_step),
        "next": _serialize_step(next_step),
    }


def _append_violation_context(violations: List[Dict[str, Any]], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    enriched: List[Dict[str, Any]] = []
    for v in violations:
        step_ref = v.get("step_ref")
        context = _find_step_context(steps, step_ref)
        with_context = dict(v)
        evidence = dict(v.get("evidence") or {})
        evidence["step_context"] = context
        with_context["evidence"] = evidence
        with_context.setdefault("human_hint", "Review this step and adjust rule/tool behavior to satisfy policy.")
        enriched.append(with_context)
    return enriched


def _build_runtime_summary(steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    latencies = [
        float(s.get("latency_ms"))
        for s in steps
        if s.get("latency_ms") is not None
    ]
    if not latencies:
        return {
            "steps_with_latency": 0,
            "avg_latency_ms": None,
            "max_latency_ms": None,
        }
    return {
        "steps_with_latency": len(latencies),
        "avg_latency_ms": round(sum(latencies) / len(latencies), 2),
        "max_latency_ms": round(max(latencies), 2),
    }


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _derive_agent_id(steps: List[Dict[str, Any]]) -> Optional[str]:
    counts: Dict[str, int] = {}
    for s in steps:
        aid = str(s.get("agent_id") or "").strip()
        if not aid:
            continue
        counts[aid] = counts.get(aid, 0) + 1
    if not counts:
        return None
    return sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[0][0]


def _build_ruleset_hash(rules: List[BehaviorRule]) -> str:
    canonical = []
    for r in rules:
        canonical.append(
            {
                "id": r.id,
                "scope_type": r.scope_type,
                "scope_ref": r.scope_ref,
                "severity_default": r.severity_default,
                "enabled": bool(r.enabled),
                "rule_json": r.rule_json or {},
                "updated_at": _iso(r.updated_at),
                "created_at": _iso(r.created_at),
            }
        )
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _build_eval_summary(
    project_id: int, trace_id: str, db: Session, top_n: int = 10
) -> Dict[str, Any]:
    """
    Aggregate evaluation_result from snapshots for a trace into a summary.
    Returns failed_checks (top N by count) and total_failed; no full eval payload.
    """
    rows = (
        db.query(Snapshot)
        .filter(Snapshot.project_id == project_id, Snapshot.trace_id == trace_id)
        .order_by(Snapshot.span_order.asc().nullslast(), Snapshot.created_at.asc())
        .all()
    )
    failed_counts: Dict[str, int] = {}
    for s in rows:
        er = s.evaluation_result
        if not isinstance(er, dict):
            continue
        # Legacy: top-level passed/violations
        if "passed" in er and "violations" in er:
            for _ in (er.get("violations") or []):
                failed_counts["legacy_violation"] = failed_counts.get("legacy_violation", 0) + 1
            continue
        # Diagnostic format: metric -> { "passed", "score", ... }
        for check_name, data in er.items():
            if isinstance(data, dict) and data.get("passed") is False:
                failed_counts[check_name] = failed_counts.get(check_name, 0) + 1
    total_failed = sum(failed_counts.values())
    failed_checks = [
        {"check": k, "count": v}
        for k, v in sorted(failed_counts.items(), key=lambda kv: -kv[1])[:top_n]
    ]
    return {"failed_checks": failed_checks, "total_failed": total_failed}


def _persist_trajectory_steps(
    project_id: int,
    trace_id: Optional[str],
    test_run_id: Optional[str],
    steps: List[Dict[str, Any]],
    db: Session,
) -> None:
    if trace_id:
        db.query(TrajectoryStep).filter(
            TrajectoryStep.project_id == project_id,
            TrajectoryStep.trace_id == trace_id,
        ).delete(synchronize_session=False)
    elif test_run_id:
        db.query(TrajectoryStep).filter(
            TrajectoryStep.project_id == project_id,
            TrajectoryStep.test_run_id == test_run_id,
        ).delete(synchronize_session=False)

    rows: List[TrajectoryStep] = []
    for s in steps:
        rows.append(
            TrajectoryStep(
                project_id=project_id,
                trace_id=trace_id,
                test_run_id=test_run_id,
                step_order=float(s.get("step_order") or 0),
                parent_step_id=None,
                is_parallel=False,
                step_type=str(s.get("step_type") or "llm_call"),
                agent_id=s.get("agent_id"),
                tool_name=s.get("tool_name"),
                tool_args=s.get("tool_args") or {},
                tool_result=None,
                latency_ms=float(s.get("latency_ms")) if s.get("latency_ms") is not None else None,
                source_type=s.get("source_type"),
                source_id=str(s.get("source_id")) if s.get("source_id") is not None else None,
            )
        )
    if rows:
        db.bulk_save_objects(rows)


def _run_behavior_validation(rules: List[BehaviorRule], steps: List[Dict[str, Any]]) -> Tuple[str, Dict[str, Any], List[Dict[str, Any]]]:
    violations: List[Dict[str, Any]] = []

    # System violations (must be added before status calculation)
    if any(s.get("_provider_unknown") for s in steps):
        violations.append({
            "rule_id": None,
            "rule_name": None,
            "severity": "critical",
            "step_ref": None,
            "message": "Unknown provider response; cannot validate tool calls",
            "evidence": {},
        })
    if any(s.get("_id_conflict") for s in steps):
        violations.append({
            "rule_id": None,
            "rule_name": None,
            "severity": "critical",
            "step_ref": None,
            "message": "Duplicate tool_call id with conflicting name or arguments",
            "evidence": {},
        })
    if any(
        s.get("step_type") == "tool_call" and (s.get("tool_name") == "" or s.get("_tool_name_empty"))
        for s in steps
    ):
        violations.append({
            "rule_id": None,
            "rule_name": None,
            "severity": "critical",
            "step_ref": None,
            "message": "Tool name empty or invalid",
            "evidence": {},
        })

    for rule in rules:
        if not rule.enabled:
            continue
        if not _match_rule_scope(rule, steps):
            continue
        rule_json = rule.rule_json or {}
        rule_type = rule_json.get("type")
        spec = rule_json.get("spec") or {}

        if rule_type == "tool_order":
            violations.extend(_validate_tool_order(rule, spec, steps))
        elif rule_type == "tool_forbidden":
            violations.extend(_validate_tool_forbidden(rule, spec, steps))
        elif rule_type == "tool_allowlist":
            violations.extend(_validate_tool_allowlist(rule, spec, steps))
        elif rule_type == "tool_args_schema":
            violations.extend(_validate_tool_args_schema(rule, spec, steps))

    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for v in violations:
        sev = str(v.get("severity") or "medium").lower()
        if sev in severity_counts:
            severity_counts[sev] += 1

    status_out = "pass" if len(violations) == 0 else "fail"
    summary = {
        "status": status_out,
        "step_count": len(steps),
        "rule_count": len(rules),
        "violation_count": len(violations),
        "severity_breakdown": severity_counts,
    }
    return status_out, summary, violations


@router.get("/projects/{project_id}/behavior/rules")
async def list_behavior_rules(
    project_id: int,
    enabled: Optional[bool] = None,
    scope_type: Optional[str] = Query(None, description="project | agent | canvas"),
    scope_ref: Optional[str] = Query(None, description="Scope reference ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db)
    query = db.query(BehaviorRule).filter(BehaviorRule.project_id == project_id)
    if enabled is not None:
        query = query.filter(BehaviorRule.enabled == enabled)
    if scope_type:
        query = query.filter(BehaviorRule.scope_type == scope_type)
    if scope_ref is not None:
        query = query.filter(BehaviorRule.scope_ref == scope_ref)
    rows = query.order_by(BehaviorRule.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "project_id": r.project_id,
            "name": r.name,
            "description": r.description,
            "scope_type": r.scope_type,
            "scope_ref": r.scope_ref,
            "severity_default": r.severity_default,
            "rule_json": r.rule_json,
            "enabled": r.enabled,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/projects/{project_id}/behavior/rules", status_code=status.HTTP_201_CREATED)
async def create_behavior_rule(
    project_id: int,
    payload: BehaviorRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.ADMIN, ProjectRole.OWNER])
    row = BehaviorRule(
        project_id=project_id,
        name=payload.name,
        description=payload.description,
        scope_type=payload.scope_type,
        scope_ref=payload.scope_ref,
        severity_default=payload.severity_default,
        rule_json=payload.rule_json,
        enabled=payload.enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "project_id": row.project_id,
        "name": row.name,
        "description": row.description,
        "scope_type": row.scope_type,
        "scope_ref": row.scope_ref,
        "severity_default": row.severity_default,
        "rule_json": row.rule_json,
        "enabled": row.enabled,
        "created_at": row.created_at,
    }


@router.put("/projects/{project_id}/behavior/rules/{rule_id}")
async def update_behavior_rule(
    project_id: int,
    rule_id: str,
    payload: BehaviorRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.ADMIN, ProjectRole.OWNER])
    row = (
        db.query(BehaviorRule)
        .filter(BehaviorRule.project_id == project_id, BehaviorRule.id == rule_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Behavior rule not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "project_id": row.project_id,
        "name": row.name,
        "description": row.description,
        "scope_type": row.scope_type,
        "scope_ref": row.scope_ref,
        "severity_default": row.severity_default,
        "rule_json": row.rule_json,
        "enabled": row.enabled,
        "created_at": row.created_at,
    }


@router.delete("/projects/{project_id}/behavior/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_behavior_rule(
    project_id: int,
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.ADMIN, ProjectRole.OWNER])
    row = (
        db.query(BehaviorRule)
        .filter(BehaviorRule.project_id == project_id, BehaviorRule.id == rule_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Behavior rule not found")
    db.delete(row)
    db.commit()
    return None


@router.get("/projects/{project_id}/behavior/reports")
async def list_behavior_reports(
    project_id: int,
    agent_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db)
    query = db.query(BehaviorReport).filter(BehaviorReport.project_id == project_id)
    if agent_id:
        query = query.filter(BehaviorReport.agent_id == agent_id)
    if status_filter:
        query = query.filter(BehaviorReport.status == status_filter)
    rows = query.order_by(BehaviorReport.created_at.desc()).offset(offset).limit(limit).all()
    total = query.count()
    return {
        "items": [
            {
                "id": r.id,
                "project_id": r.project_id,
                "trace_id": r.trace_id,
                "test_run_id": r.test_run_id,
                "agent_id": r.agent_id,
                "baseline_run_ref": r.baseline_run_ref,
                "ruleset_hash": r.ruleset_hash,
                "status": r.status,
                "summary": r.summary_json,
                "violations": r.violations_json,
                "created_at": r.created_at,
            }
            for r in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/projects/{project_id}/behavior/datasets/batch")
async def batch_create_validation_datasets(
    project_id: int,
    body: BatchCreateDatasetsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create multiple validation datasets in one request (one item per snapshot or group)."""
    check_project_access(project_id, current_user, db)
    created: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for idx, payload in enumerate(body.items):
        if not payload.trace_ids and not payload.snapshot_ids:
            errors.append({"index": idx, "message": "At least one of trace_ids or snapshot_ids is required"})
            continue
        try:
            resolved_agent_id = _resolve_dataset_agent_id(
                project_id=project_id,
                snapshot_ids=payload.snapshot_ids,
                requested_agent_id=payload.agent_id,
                db=db,
            )
            ds = ValidationDataset(
                project_id=project_id,
                agent_id=resolved_agent_id,
                trace_ids=payload.trace_ids,
                snapshot_ids=payload.snapshot_ids,
                eval_config_snapshot=payload.eval_config_snapshot,
                policy_ruleset_snapshot=payload.policy_ruleset_snapshot,
                ruleset_hash=payload.ruleset_hash,
                label=payload.label,
                tag=payload.tag,
            )
            db.add(ds)
            db.commit()
            db.refresh(ds)
            created.append({
                "id": ds.id,
                "project_id": ds.project_id,
                "agent_id": ds.agent_id,
                "trace_ids": ds.trace_ids,
                "snapshot_ids": ds.snapshot_ids,
                "eval_config_snapshot": ds.eval_config_snapshot,
                "policy_ruleset_snapshot": ds.policy_ruleset_snapshot,
                "ruleset_hash": ds.ruleset_hash,
                "label": ds.label,
                "tag": ds.tag,
                "created_at": ds.created_at.isoformat() if ds.created_at else None,
            })
        except Exception as e:
            db.rollback()
            errors.append({"index": idx, "message": str(e)})
    return {"created": created, "errors": errors if errors else None}


@router.post("/projects/{project_id}/behavior/datasets")
async def create_validation_dataset(
    project_id: int,
    payload: ValidationDatasetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a validation dataset from current run/selection (trace_ids or snapshot_ids + config snapshots)."""
    check_project_access(project_id, current_user, db)
    if not payload.trace_ids and not payload.snapshot_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of trace_ids or snapshot_ids is required",
        )
    resolved_agent_id = _resolve_dataset_agent_id(
        project_id=project_id,
        snapshot_ids=payload.snapshot_ids,
        requested_agent_id=payload.agent_id,
        db=db,
    )
    ds = ValidationDataset(
        project_id=project_id,
        agent_id=resolved_agent_id,
        trace_ids=payload.trace_ids,
        snapshot_ids=payload.snapshot_ids,
        eval_config_snapshot=payload.eval_config_snapshot,
        policy_ruleset_snapshot=payload.policy_ruleset_snapshot,
        ruleset_hash=payload.ruleset_hash,
        label=payload.label,
        tag=payload.tag,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return {
        "id": ds.id,
        "project_id": ds.project_id,
        "agent_id": ds.agent_id,
        "trace_ids": ds.trace_ids,
        "snapshot_ids": ds.snapshot_ids,
        "eval_config_snapshot": ds.eval_config_snapshot,
        "policy_ruleset_snapshot": ds.policy_ruleset_snapshot,
        "ruleset_hash": ds.ruleset_hash,
        "label": ds.label,
        "tag": ds.tag,
        "created_at": ds.created_at,
    }


@router.get("/projects/{project_id}/behavior/datasets")
async def list_validation_datasets(
    project_id: int,
    agent_id: Optional[str] = None,
    summary: bool = Query(
        True,
        description="If true, returns lightweight dataset list without heavy config snapshots.",
    ),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List validation datasets for the project."""
    check_project_access(project_id, current_user, db)
    query = db.query(ValidationDataset).filter(ValidationDataset.project_id == project_id)
    if agent_id:
        query = query.filter(ValidationDataset.agent_id == agent_id)
    rows = query.order_by(ValidationDataset.created_at.desc()).offset(offset).limit(limit).all()
    total = query.count()
    items = []
    for d in rows:
        snapshot_ids = d.snapshot_ids if isinstance(d.snapshot_ids, list) else []
        base_item = {
            "id": d.id,
            "project_id": d.project_id,
            "agent_id": d.agent_id,
            "snapshot_count": len(snapshot_ids),
            "label": d.label,
            "tag": d.tag,
            "created_at": d.created_at,
        }
        if summary:
            items.append(base_item)
        else:
            items.append(
                {
                    **base_item,
                    "trace_ids": d.trace_ids,
                    "snapshot_ids": snapshot_ids,
                    "eval_config_snapshot": d.eval_config_snapshot,
                    "policy_ruleset_snapshot": d.policy_ruleset_snapshot,
                    "ruleset_hash": d.ruleset_hash,
                }
            )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/projects/{project_id}/behavior/datasets/{dataset_id}")
async def get_validation_dataset(
    project_id: int,
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single validation dataset by ID."""
    check_project_access(project_id, current_user, db)
    ds = (
        db.query(ValidationDataset)
        .filter(ValidationDataset.project_id == project_id, ValidationDataset.id == dataset_id)
        .first()
    )
    if not ds:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validation dataset not found")
    return {
        "id": ds.id,
        "project_id": ds.project_id,
        "agent_id": ds.agent_id,
        "trace_ids": ds.trace_ids,
        "snapshot_ids": ds.snapshot_ids,
        "eval_config_snapshot": ds.eval_config_snapshot,
        "policy_ruleset_snapshot": ds.policy_ruleset_snapshot,
        "ruleset_hash": ds.ruleset_hash,
        "label": ds.label,
        "tag": ds.tag,
        "created_at": ds.created_at,
    }


@router.patch("/projects/{project_id}/behavior/datasets/{dataset_id}")
async def update_validation_dataset(
    project_id: int,
    dataset_id: str,
    payload: ValidationDatasetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a validation dataset (e.g. snapshot_ids to remove a single log)."""
    check_project_access(project_id, current_user, db)
    ds = (
        db.query(ValidationDataset)
        .filter(ValidationDataset.project_id == project_id, ValidationDataset.id == dataset_id)
        .first()
    )
    if not ds:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validation dataset not found")
    if payload.snapshot_ids is not None:
        resolved_agent_id = _resolve_dataset_agent_id(
            project_id=project_id,
            snapshot_ids=payload.snapshot_ids,
            requested_agent_id=ds.agent_id,
            db=db,
        )
        ds.snapshot_ids = payload.snapshot_ids
        ds.agent_id = resolved_agent_id
    if payload.label is not None:
        normalized_label = payload.label.strip()
        ds.label = normalized_label or None
    db.commit()
    db.refresh(ds)
    return {
        "id": ds.id,
        "project_id": ds.project_id,
        "agent_id": ds.agent_id,
        "trace_ids": ds.trace_ids,
        "snapshot_ids": ds.snapshot_ids,
        "eval_config_snapshot": ds.eval_config_snapshot,
        "policy_ruleset_snapshot": ds.policy_ruleset_snapshot,
        "ruleset_hash": ds.ruleset_hash,
        "label": ds.label,
        "tag": ds.tag,
        "created_at": ds.created_at,
    }


@router.get("/projects/{project_id}/behavior/datasets/{dataset_id}/snapshots")
async def list_dataset_snapshots(
    project_id: int,
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List snapshots belonging to a validation dataset (for Drift left pane)."""
    check_project_access(project_id, current_user, db)
    ds = (
        db.query(ValidationDataset)
        .filter(ValidationDataset.project_id == project_id, ValidationDataset.id == dataset_id)
        .first()
    )
    if not ds:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validation dataset not found")
    snapshot_ids = ds.snapshot_ids
    if not isinstance(snapshot_ids, list) or len(snapshot_ids) == 0:
        return {"items": [], "total": 0}
    ids = []
    for x in snapshot_ids:
        if x is None:
            continue
        if isinstance(x, int):
            ids.append(x)
        elif isinstance(x, str) and x.isdigit():
            ids.append(int(x))
    if not ids:
        return {"items": [], "total": 0}
    rows = (
        db.query(Snapshot)
        .filter(Snapshot.project_id == project_id, Snapshot.id.in_(ids))
        .order_by(Snapshot.created_at.desc())
        .all()
    )
    # Preserve order of snapshot_ids when possible
    id_to_row = {r.id: r for r in rows}
    ordered = [id_to_row[i] for i in ids if i in id_to_row]
    items = []
    for r in ordered:
        cost_val = r.cost
        if cost_val is not None and hasattr(cost_val, "__float__"):
            cost_val = float(cost_val)
        items.append({
            "id": r.id,
            "project_id": r.project_id,
            "trace_id": r.trace_id,
            "agent_id": r.agent_id,
            "provider": r.provider,
            "model": r.model,
            "model_settings": r.model_settings,
            "system_prompt": r.system_prompt,
            "user_message": r.user_message,
            "response": r.response,
            "payload": r.payload,
            "latency_ms": r.latency_ms,
            "tokens_used": r.tokens_used,
            "cost": cost_val,
            "signal_result": r.signal_result,
            "evaluation_result": r.evaluation_result,
            "status_code": r.status_code,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "is_worst": r.is_worst,
            "is_golden": r.is_golden,
            "eval_checks_result": getattr(r, "eval_checks_result", None),
            "eval_config_version": getattr(r, "eval_config_version", None),
        })
    return {"items": items, "total": len(items)}


def _delete_validation_dataset_impl(
    project_id: int,
    dataset_id: str,
    db: Session,
) -> None:
    """Shared implementation for deleting a validation dataset."""
    ds = (
        db.query(ValidationDataset)
        .filter(ValidationDataset.project_id == project_id, ValidationDataset.id == dataset_id)
        .first()
    )
    if not ds:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validation dataset not found")
    db.delete(ds)
    db.commit()


@router.post("/projects/{project_id}/behavior/datasets/batch-delete")
async def batch_delete_validation_datasets(
    project_id: int,
    body: BatchDeleteDatasetsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete multiple validation datasets in one request (faster than N single deletes)."""
    check_project_access(project_id, current_user, db)
    deleted = 0
    for dataset_id in body.dataset_ids:
        try:
            _delete_validation_dataset_impl(project_id, dataset_id, db)
            deleted += 1
        except HTTPException:
            # Skip not-found; continue with others
            continue
    return {"ok": True, "deleted": deleted}


@router.delete("/projects/{project_id}/behavior/datasets/{dataset_id}")
async def delete_validation_dataset(
    project_id: int,
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a validation dataset by ID."""
    check_project_access(project_id, current_user, db)
    _delete_validation_dataset_impl(project_id, dataset_id, db)
    return {"ok": True}


@router.post("/projects/{project_id}/behavior/datasets/{dataset_id}/delete")
async def post_delete_validation_dataset(
    project_id: int,
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a validation dataset by ID (POST fallback for environments that block DELETE)."""
    check_project_access(project_id, current_user, db)
    _delete_validation_dataset_impl(project_id, dataset_id, db)
    return {"ok": True}


@router.get("/projects/{project_id}/behavior/reports/{report_id}/export")
async def export_behavior_report(
    project_id: int,
    report_id: str,
    format: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db)
    report = (
        db.query(BehaviorReport)
        .filter(BehaviorReport.project_id == project_id, BehaviorReport.id == report_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Behavior report not found")

    payload = {
        "id": report.id,
        "project_id": report.project_id,
        "trace_id": report.trace_id,
        "test_run_id": report.test_run_id,
        "agent_id": report.agent_id,
        "baseline_run_ref": report.baseline_run_ref,
        "ruleset_hash": report.ruleset_hash,
        "status": report.status,
        "summary": report.summary_json,
        "violations": report.violations_json,
        "created_at": _iso(report.created_at),
    }
    if format == "json":
        return payload

    csv_io = StringIO()
    writer = csv.writer(csv_io)
    writer.writerow(
        [
            "report_id",
            "project_id",
            "status",
            "agent_id",
            "trace_id",
            "test_run_id",
            "ruleset_hash",
            "created_at",
            "rule_id",
            "rule_name",
            "severity",
            "step_ref",
            "message",
        ]
    )
    violations = report.violations_json or []
    if not violations:
        writer.writerow(
            [
                report.id,
                report.project_id,
                report.status,
                report.agent_id or "",
                report.trace_id or "",
                report.test_run_id or "",
                report.ruleset_hash or "",
                _iso(report.created_at) or "",
                "",
                "",
                "",
                "",
                "",
            ]
        )
    else:
        for v in violations:
            writer.writerow(
                [
                    report.id,
                    report.project_id,
                    report.status,
                    report.agent_id or "",
                    report.trace_id or "",
                    report.test_run_id or "",
                    report.ruleset_hash or "",
                    _iso(report.created_at) or "",
                    v.get("rule_id", ""),
                    v.get("rule_name", ""),
                    v.get("severity", ""),
                    v.get("step_ref", ""),
                    v.get("message", ""),
                ]
            )

    return Response(
        content=csv_io.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="behavior_report_{report.id}.csv"'
        },
    )


def _is_tool_use_policy_enabled(project_id: int, agent_id: Optional[str], db: Session) -> bool:
    """Return True if tool_use_policy eval is enabled for this project/agent (default True if not set)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project and isinstance(project.diagnostic_config, dict):
        eval_cfg = (project.diagnostic_config or {}).get("eval") or {}
        tup = (eval_cfg.get("tool_use_policy") or {})
        if tup.get("enabled") is False:
            return False
    if agent_id:
        setting = (
            db.query(AgentDisplaySetting)
            .filter(
                AgentDisplaySetting.project_id == project_id,
                AgentDisplaySetting.system_prompt_hash == agent_id,
            )
            .first()
        )
        if setting and isinstance(setting.diagnostic_config, dict):
            eval_cfg = (setting.diagnostic_config or {}).get("eval") or {}
            tup = (eval_cfg.get("tool_use_policy") or {})
            if tup.get("enabled") is False:
                return False
    return True


def run_behavior_validation_for_trace(
    project_id: int, trace_id: str, db: Session
) -> Optional[BehaviorReport]:
    """
    Run policy (behavior) validation for a trace and persist a BehaviorReport.
    Called after snapshot save (sync or stream) so Clinical Log shows result without manual Run check.
    Skips if tool_use_policy is disabled for this project/agent, or if trace has no steps.
    """
    steps = _build_trace_steps(project_id, trace_id, db)
    if not steps:
        return None
    agent_id = _derive_agent_id(steps)
    if not _is_tool_use_policy_enabled(project_id, agent_id, db):
        return None

    rules = (
        db.query(BehaviorRule)
        .filter(BehaviorRule.project_id == project_id, BehaviorRule.enabled.is_(True))
        .order_by(BehaviorRule.created_at.asc())
        .all()
    )
    effective_rules, policy_resolution = _resolve_effective_rules(rules, steps)
    ruleset_hash = _build_ruleset_hash(effective_rules)
    rule_snapshot = [
        {"id": r.id, "revision": _iso(r.updated_at), "rule_json": r.rule_json or {}}
        for r in effective_rules
    ]
    status_out, summary, violations = _run_behavior_validation(effective_rules, steps)
    violations = _append_violation_context(violations, steps)
    runtime_summary = _build_runtime_summary(steps)
    summary["runtime"] = runtime_summary
    summary["target"] = {"type": "trace", "trace_id": trace_id, "test_run_id": None}
    summary["agent_id"] = agent_id
    summary["ruleset_hash"] = ruleset_hash
    summary["rule_snapshot"] = rule_snapshot
    summary["normalizer_version"] = "v1"
    summary["policy_resolution"] = policy_resolution
    try:
        summary["eval_summary"] = _build_eval_summary(project_id, trace_id, db)
    except Exception:
        summary["eval_summary"] = None

    _persist_trajectory_steps(project_id, trace_id, None, steps, db)

    report = BehaviorReport(
        project_id=project_id,
        trace_id=trace_id,
        test_run_id=None,
        agent_id=agent_id,
        baseline_run_ref=None,
        ruleset_hash=ruleset_hash,
        status=status_out,
        summary_json=summary,
        violations_json=violations,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.post("/projects/{project_id}/behavior/validate")
async def validate_behavior(
    project_id: int,
    payload: BehaviorValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db)
    if not payload.trace_id and not payload.test_run_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="trace_id or test_run_id is required")

    # Load rules (enabled only unless explicit IDs are provided).
    rules_query = db.query(BehaviorRule).filter(BehaviorRule.project_id == project_id)
    if payload.rule_ids:
        rules_query = rules_query.filter(BehaviorRule.id.in_(payload.rule_ids))
    else:
        rules_query = rules_query.filter(BehaviorRule.enabled.is_(True))
    rules = rules_query.order_by(BehaviorRule.created_at.asc()).all()

    run_meta: Optional[Dict[str, Any]] = None
    duration_ms: Optional[int] = None

    if payload.trace_id:
        steps = _build_trace_steps(project_id, payload.trace_id, db)
    else:
        run_id = payload.test_run_id or ""
        steps = _build_run_steps(project_id, run_id, db)

        run = (
            db.query(TestRun)
            .filter(TestRun.project_id == project_id, TestRun.id == run_id)
            .first()
        )
        if run:
            cfg = run.agent_config or {}
            version_tag = cfg.get("version_tag") or cfg.get("run_tag")
            run_meta = {
                "run_id": run.id,
                "name": run.name,
                "status": run.status,
                "test_type": run.test_type,
                "version_tag": version_tag,
                "canvas_id": cfg.get("canvas_id"),
                "created_at": _iso(run.created_at),
                "total_count": run.total_count,
                "pass_count": run.pass_count,
                "fail_count": run.fail_count,
            }

            run_rows = (
                db.query(TestResult)
                .filter(TestResult.project_id == project_id, TestResult.test_run_id == run_id)
                .order_by(TestResult.created_at.asc())
                .all()
            )
            if run_rows and run_rows[0].created_at and run_rows[-1].created_at:
                duration_ms = int((run_rows[-1].created_at - run_rows[0].created_at).total_seconds() * 1000)

    report_agent_id = _derive_agent_id(steps)
    _persist_trajectory_steps(project_id, payload.trace_id, payload.test_run_id, steps, db)

    effective_rules, policy_resolution = _resolve_effective_rules(rules, steps)
    ruleset_hash = _build_ruleset_hash(effective_rules)
    rule_snapshot = [
        {"id": r.id, "revision": _iso(r.updated_at), "rule_json": r.rule_json or {}}
        for r in effective_rules
    ]
    status_out, summary, violations = _run_behavior_validation(effective_rules, steps)
    violations = _append_violation_context(violations, steps)
    runtime_summary = _build_runtime_summary(steps)
    runtime_summary["duration_ms"] = duration_ms
    summary["runtime"] = runtime_summary
    summary["target"] = {
        "type": "trace" if payload.trace_id else "test_run",
        "trace_id": payload.trace_id,
        "test_run_id": payload.test_run_id,
    }
    summary["agent_id"] = report_agent_id
    summary["ruleset_hash"] = ruleset_hash
    summary["rule_snapshot"] = rule_snapshot
    summary["normalizer_version"] = "v1"
    summary["policy_resolution"] = policy_resolution
    if run_meta:
        summary["run_meta"] = run_meta
    # Eval summary (aggregate only) when validating by trace_id
    if payload.trace_id:
        try:
            summary["eval_summary"] = _build_eval_summary(project_id, payload.trace_id, db)
        except Exception:
            summary["eval_summary"] = None
    else:
        summary["eval_summary"] = None
    report = BehaviorReport(
        project_id=project_id,
        trace_id=payload.trace_id,
        test_run_id=payload.test_run_id,
        agent_id=report_agent_id,
        baseline_run_ref=payload.baseline_run_ref,
        ruleset_hash=ruleset_hash,
        status=status_out,
        summary_json=summary,
        violations_json=violations,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "report_id": report.id,
        "status": status_out,
        "summary": summary,
        "violations": violations,
    }


@router.post("/projects/{project_id}/behavior/compare")
async def compare_behavior(
    project_id: int,
    payload: BehaviorCompareRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Compare two test runs and return violations delta, severity delta, and top regressed rules.
    """
    check_project_access(project_id, current_user, db)

    # Validate both runs exist
    baseline_run = (
        db.query(TestRun)
        .filter(TestRun.project_id == project_id, TestRun.id == payload.baseline_test_run_id)
        .first()
    )
    if not baseline_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Baseline test run {payload.baseline_test_run_id} not found",
        )

    candidate_run = (
        db.query(TestRun)
        .filter(TestRun.project_id == project_id, TestRun.id == payload.candidate_test_run_id)
        .first()
    )
    if not candidate_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate test run {payload.candidate_test_run_id} not found",
        )

    # Load rules
    rules_query = db.query(BehaviorRule).filter(BehaviorRule.project_id == project_id)
    if payload.rule_ids:
        rules_query = rules_query.filter(BehaviorRule.id.in_(payload.rule_ids))
    else:
        rules_query = rules_query.filter(BehaviorRule.enabled.is_(True))
    rules = rules_query.order_by(BehaviorRule.created_at.asc()).all()

    # Build steps for both runs
    baseline_steps = _build_run_steps(project_id, payload.baseline_test_run_id, db)
    candidate_steps = _build_run_steps(project_id, payload.candidate_test_run_id, db)

    # Run validation for both with effective policy resolution per run
    baseline_effective_rules, baseline_policy_resolution = _resolve_effective_rules(rules, baseline_steps)
    candidate_effective_rules, candidate_policy_resolution = _resolve_effective_rules(rules, candidate_steps)
    baseline_status, baseline_summary, baseline_violations = _run_behavior_validation(baseline_effective_rules, baseline_steps)
    candidate_status, candidate_summary, candidate_violations = _run_behavior_validation(candidate_effective_rules, candidate_steps)
    baseline_summary["policy_resolution"] = baseline_policy_resolution
    baseline_summary["ruleset_hash"] = _build_ruleset_hash(baseline_effective_rules)
    baseline_summary["rule_snapshot"] = [
        {"id": r.id, "revision": _iso(r.updated_at), "rule_json": r.rule_json or {}}
        for r in baseline_effective_rules
    ]
    candidate_summary["policy_resolution"] = candidate_policy_resolution
    candidate_summary["ruleset_hash"] = _build_ruleset_hash(candidate_effective_rules)
    candidate_summary["rule_snapshot"] = [
        {"id": r.id, "revision": _iso(r.updated_at), "rule_json": r.rule_json or {}}
        for r in candidate_effective_rules
    ]

    # Calculate deltas
    baseline_severity_counts = baseline_summary.get("severity_breakdown", {})
    candidate_severity_counts = candidate_summary.get("severity_breakdown", {})

    severity_delta = {
        "critical": candidate_severity_counts.get("critical", 0) - baseline_severity_counts.get("critical", 0),
        "high": candidate_severity_counts.get("high", 0) - baseline_severity_counts.get("high", 0),
        "medium": candidate_severity_counts.get("medium", 0) - baseline_severity_counts.get("medium", 0),
        "low": candidate_severity_counts.get("low", 0) - baseline_severity_counts.get("low", 0),
    }

    violation_count_delta = candidate_summary.get("violation_count", 0) - baseline_summary.get("violation_count", 0)

    # Find top regressed rules (rules that have more violations in candidate)
    baseline_rule_violations: Dict[str, int] = {}
    candidate_rule_violations: Dict[str, int] = {}

    for v in baseline_violations:
        rule_id = v.get("rule_id", "")
        baseline_rule_violations[rule_id] = baseline_rule_violations.get(rule_id, 0) + 1

    for v in candidate_violations:
        rule_id = v.get("rule_id", "")
        candidate_rule_violations[rule_id] = candidate_rule_violations.get(rule_id, 0) + 1

    regressed_rules: List[Dict[str, Any]] = []
    for rule_id, candidate_count in candidate_rule_violations.items():
        baseline_count = baseline_rule_violations.get(rule_id, 0)
        if candidate_count > baseline_count:
            rule = next((r for r in rules if r.id == rule_id), None)
            regressed_rules.append(
                {
                    "rule_id": rule_id,
                    "rule_name": rule.name if rule else "Unknown",
                    "baseline_violations": baseline_count,
                    "candidate_violations": candidate_count,
                    "delta": candidate_count - baseline_count,
                }
            )

    # Sort by delta descending
    regressed_rules.sort(key=lambda x: x["delta"], reverse=True)

    # Find first broken step (earliest step_order with violation in candidate but not in baseline)
    baseline_step_refs = {float(v.get("step_ref", 0)) for v in baseline_violations if v.get("step_ref") is not None}
    candidate_step_refs = {float(v.get("step_ref", 0)) for v in candidate_violations if v.get("step_ref") is not None}
    new_violation_steps = sorted(candidate_step_refs - baseline_step_refs)
    first_broken_step = new_violation_steps[0] if new_violation_steps else None

    return {
        "baseline_run_id": payload.baseline_test_run_id,
        "candidate_run_id": payload.candidate_test_run_id,
        "baseline_summary": baseline_summary,
        "candidate_summary": candidate_summary,
        "violation_count_delta": violation_count_delta,
        "severity_delta": severity_delta,
        "top_regressed_rules": regressed_rules[:10],  # Top 10
        "first_broken_step": first_broken_step,
        "is_regressed": violation_count_delta > 0,
    }


@router.post("/projects/{project_id}/behavior/ci-gate")
async def ci_gate_behavior(
    project_id: int,
    payload: CIGateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    CI/CD gate endpoint that validates a test run against thresholds.
    Returns pass/fail status and exit_code suitable for CI pipelines.
    """
    check_project_access(project_id, current_user, db)

    # Validate candidate run exists
    candidate_run = (
        db.query(TestRun)
        .filter(TestRun.project_id == project_id, TestRun.id == payload.candidate_test_run_id)
        .first()
    )
    if not candidate_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate test run {payload.candidate_test_run_id} not found",
        )

    # If baseline is provided, compare mode; otherwise, absolute threshold mode
    compare_mode = bool(payload.baseline_test_run_id)

    # Load rules
    rules_query = db.query(BehaviorRule).filter(BehaviorRule.project_id == project_id)
    if payload.rule_ids:
        rules_query = rules_query.filter(BehaviorRule.id.in_(payload.rule_ids))
    else:
        rules_query = rules_query.filter(BehaviorRule.enabled.is_(True))
    rules = rules_query.order_by(BehaviorRule.created_at.asc()).all()

    # Build steps for candidate
    candidate_steps = _build_run_steps(project_id, payload.candidate_test_run_id, db)
    _persist_trajectory_steps(project_id, None, payload.candidate_test_run_id, candidate_steps, db)
    report_agent_id = _derive_agent_id(candidate_steps)
    candidate_effective_rules, candidate_policy_resolution = _resolve_effective_rules(rules, candidate_steps)
    ruleset_hash = _build_ruleset_hash(candidate_effective_rules)
    candidate_status, candidate_summary, candidate_violations = _run_behavior_validation(candidate_effective_rules, candidate_steps)

    # Get severity counts
    severity_counts = candidate_summary.get("severity_breakdown", {})
    thresholds = payload.thresholds or {}

    # Check thresholds
    pass_gate = True
    failure_reasons: List[str] = []

    if compare_mode and payload.baseline_test_run_id:
        # Compare mode: check delta thresholds
        baseline_steps = _build_run_steps(project_id, payload.baseline_test_run_id, db)
        baseline_effective_rules, _baseline_policy_resolution = _resolve_effective_rules(rules, baseline_steps)
        baseline_status, baseline_summary, baseline_violations = _run_behavior_validation(baseline_effective_rules, baseline_steps)
        baseline_severity_counts = baseline_summary.get("severity_breakdown", {})

        severity_delta = {
            "critical": severity_counts.get("critical", 0) - baseline_severity_counts.get("critical", 0),
            "high": severity_counts.get("high", 0) - baseline_severity_counts.get("high", 0),
            "medium": severity_counts.get("medium", 0) - baseline_severity_counts.get("medium", 0),
            "low": severity_counts.get("low", 0) - baseline_severity_counts.get("low", 0),
        }

        # Check delta thresholds (e.g., "critical_delta": 0 means no increase allowed)
        for severity in ["critical", "high", "medium", "low"]:
            delta_key = f"{severity}_delta"
            if delta_key in thresholds:
                max_delta = thresholds[delta_key]
                actual_delta = severity_delta.get(severity, 0)
                if actual_delta > max_delta:
                    pass_gate = False
                    failure_reasons.append(
                        f"{severity.upper()} violations increased by {actual_delta} (threshold: {max_delta})"
                    )
    else:
        # Absolute threshold mode: check absolute counts
        for severity in ["critical", "high", "medium", "low"]:
            if severity in thresholds:
                max_count = thresholds[severity]
                actual_count = severity_counts.get(severity, 0)
                if actual_count > max_count:
                    pass_gate = False
                    failure_reasons.append(
                        f"{severity.upper()} violations: {actual_count} (threshold: {max_count})"
                    )

    # Create report for reference
    candidate_violations_enriched = _append_violation_context(candidate_violations, candidate_steps)
    runtime_summary = _build_runtime_summary(candidate_steps)

    cfg = candidate_run.agent_config or {}
    version_tag = cfg.get("version_tag") or cfg.get("run_tag")
    run_meta = {
        "run_id": candidate_run.id,
        "name": candidate_run.name,
        "status": candidate_run.status,
        "test_type": candidate_run.test_type,
        "version_tag": version_tag,
        "canvas_id": cfg.get("canvas_id"),
        "created_at": _iso(candidate_run.created_at),
        "total_count": candidate_run.total_count,
        "pass_count": candidate_run.pass_count,
        "fail_count": candidate_run.fail_count,
    }

    candidate_summary["runtime"] = runtime_summary
    candidate_summary["target"] = {
        "type": "test_run",
        "test_run_id": payload.candidate_test_run_id,
    }
    candidate_summary["agent_id"] = report_agent_id
    candidate_summary["ruleset_hash"] = ruleset_hash
    candidate_summary["rule_snapshot"] = [
        {"id": r.id, "revision": _iso(r.updated_at), "rule_json": r.rule_json or {}}
        for r in candidate_effective_rules
    ]
    candidate_summary["normalizer_version"] = "v1"
    candidate_summary["policy_resolution"] = candidate_policy_resolution
    candidate_summary["run_meta"] = run_meta

    report = BehaviorReport(
        project_id=project_id,
        test_run_id=payload.candidate_test_run_id,
        agent_id=report_agent_id,
        baseline_run_ref=payload.baseline_test_run_id,
        ruleset_hash=ruleset_hash,
        status="pass" if pass_gate else "fail",
        summary_json=candidate_summary,
        violations_json=candidate_violations_enriched,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # Construct report URL using the project's real organization scope.
    project = db.query(Project).filter(Project.id == project_id).first()
    org_id = project.organization_id if project else project_id
    report_url = f"/organizations/{org_id}/projects/{project_id}/behavior?report_id={report.id}"

    return {
        "pass": pass_gate,
        "exit_code": 0 if pass_gate else 1,
        "report_id": report.id,
        "report_url": report_url,
        "summary": candidate_summary,
        "violations": candidate_violations_enriched,
        "failure_reasons": failure_reasons if not pass_gate else [],
        "thresholds_used": thresholds,
        "compare_mode": compare_mode,
    }

