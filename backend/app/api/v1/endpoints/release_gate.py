"""
Release Gate endpoints.

MVP flow:
1) Use fixed production trace inputs
2) Replay with optional model/system prompt override
3) Validate behavior policies against baseline trace
4) Return CI-friendly pass/fail result + evidence

Baseline vs Run eval:
- Baseline snapshots show eval result from snapshot capture time (eval_checks_result).
  Do not re-evaluate baseline with current config in Release Gate MVP.
- Run result is evaluated with current agent + current eval config; it is the source
  of truth for "pass/fail with current setup".
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.api.v1.endpoints.behavior import (
    _append_violation_context,
    _build_ruleset_hash,
    _derive_agent_id,
    _iso,
    _resolve_effective_rules,
    _run_behavior_validation,
)
from app.core.behavior_diff import compute_behavior_diff, tool_calls_summary_to_sequence
from app.core.canonical import (
    response_to_canonical_steps,
    response_to_canonical_tool_calls_summary,
)
from app.core.database import get_db
from app.core.permissions import check_project_access
from app.core.usage_limits import check_guard_credits_limit
from app.core.security import get_current_user, get_user_from_api_key
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.behavior_report import BehaviorReport
from app.models.behavior_rule import BehaviorRule
from app.models.snapshot import Snapshot
from app.models.user import User
from app.models.validation_dataset import ValidationDataset
from app.services.replay_service import replay_service
from app.services.user_api_key_service import UserApiKeyService

router = APIRouter()
SUPPORTED_REPLAY_PROVIDERS = {"openai", "anthropic", "google"}

def _has_eval_fail(eval_checks_result: Any) -> bool:
    """
    True when at least one stored eval check is an explicit fail.
    Expected shape: {check_id: "pass"|"fail"|"not_applicable"|...}
    """
    if not eval_checks_result or not isinstance(eval_checks_result, dict):
        return False
    for _k, v in eval_checks_result.items():
        if str(v).lower() == "fail":
            return True
    return False


def _is_pass_eval_checks(eval_checks_result: Any) -> bool:
    """
    PASS for Recommended-set Golden means:
    - no explicit fail
    - at least one explicit pass (N/A-only rows are neutral, not golden)
    """
    if not eval_checks_result or not isinstance(eval_checks_result, dict):
        return False
    has_pass = any(str(v).lower() == "pass" for v in eval_checks_result.values())
    return has_pass and not _has_eval_fail(eval_checks_result)


@router.get("/projects/{project_id}/release-gate/agents/{agent_id}/recommended-snapshots")
def get_recommended_snapshots_for_agent(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the fixed MVP "Recommended set" for Release Gate:
    - time window: last 7 days
    - Worst 20: snapshots with explicit FAIL in eval_checks_result, newest first
    - Golden 20: snapshots with PASS eval_checks_result, newest first
    - fallback: fill up to 40 with most recent snapshots in the window
    """
    check_project_access(project_id, current_user, db)
    effective_agent_id = str(agent_id or "").strip()
    if not effective_agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="agent_id is required.",
        )

    window_days = 7
    since = datetime.utcnow() - timedelta(days=window_days)
    snapshots = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id == effective_agent_id,
            Snapshot.created_at >= since,
        )
        .order_by(Snapshot.created_at.desc())
        .limit(800)
        .all()
    )

    worst: List[Snapshot] = []
    golden: List[Snapshot] = []
    for s in snapshots:
        checks = getattr(s, "eval_checks_result", None)
        if _has_eval_fail(checks):
            worst.append(s)
        elif _is_pass_eval_checks(checks):
            golden.append(s)

    worst = worst[:20]
    golden = golden[:20]
    picked_ids: List[int] = []
    seen: Set[int] = set()
    for s in worst + golden:
        if s.id in seen:
            continue
        seen.add(s.id)
        picked_ids.append(s.id)

    # Fill to 40 with the most recent snapshots in the window.
    target_total = 40
    fill: List[Snapshot] = []
    if len(picked_ids) < target_total:
        for s in snapshots:
            if s.id in seen:
                continue
            seen.add(s.id)
            picked_ids.append(s.id)
            fill.append(s)
            if len(picked_ids) >= target_total:
                break

    def _to_item(s: Snapshot) -> Dict[str, Any]:
        created_at = getattr(s, "created_at", None)
        return {
            "id": s.id,
            "trace_id": getattr(s, "trace_id", None),
            "created_at": (created_at.isoformat() if created_at else None),
        }

    w = len(worst)
    g = len(golden)
    return {
        "snapshot_ids": picked_ids,
        # Additive fields for UI: allow Worst/Golden to be shown as separate lists.
        "worst_snapshot_ids": [s.id for s in worst],
        "golden_snapshot_ids": [s.id for s in golden],
        "fill_snapshot_ids": [s.id for s in fill],
        "worst_items": [_to_item(s) for s in worst],
        "golden_items": [_to_item(s) for s in golden],
        "fill_items": [_to_item(s) for s in fill],
        "meta": {"worst": w, "golden": g, "window_days": window_days},
        "label": f"Recommended: Worst {w} + Golden {g} (last {window_days} days)",
    }


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
    model_source: Literal["detected", "platform"] = Field(
        "detected",
        description="Model source mode. detected=use node model; platform=use platform-provided model override.",
    )
    new_model: Optional[str] = Field(None, description="Replay model override")
    replay_provider: Optional[Literal["openai", "anthropic", "google"]] = Field(
        None, description="Optional provider override for replay calls."
    )
    replay_api_key: Optional[str] = Field(
        None,
        description=(
            "Optional provider API key override for replay calls. "
            "When omitted, server-side provider key is used."
        ),
    )
    new_system_prompt: Optional[str] = Field(None, description="Replay system prompt override")
    replay_temperature: Optional[float] = Field(None, description="Replay request temperature override")
    replay_max_tokens: Optional[int] = Field(None, description="Replay request max_tokens override")
    replay_top_p: Optional[float] = Field(None, description="Replay request top_p override")
    replay_overrides: Optional[Dict[str, Any]] = Field(
        None, description="Optional dict merged into replay request body (e.g. tools, extra params)"
    )
    rule_ids: Optional[List[str]] = Field(None, description="Optional specific rule IDs")
    max_snapshots: int = Field(20, ge=1, le=100, description="Max snapshots replayed from trace")
    repeat_runs: int = Field(3, ge=1, le=5, description="Repeat replay N times")
    fail_rate_max: float = Field(
        0.05,
        ge=0.0,
        le=1.0,
        description="Gate passes if FAIL case ratio <= this value.",
    )
    flaky_rate_max: float = Field(
        0.03,
        ge=0.0,
        le=1.0,
        description="Gate passes if FLAKY case ratio <= this value.",
    )
    evaluation_mode: Literal["replay_test"] = Field(
        "replay_test",
        description="Replay Test only.",
    )


def _iso(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    try:
        return value.isoformat()
    except Exception:
        return None


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

        canonical_steps = response_to_canonical_steps(
            res.get("response_data"),
            provider_hint=res.get("replay_provider"),
            step_order_base=order,
            base_meta=base,
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

    return sorted(steps, key=lambda x: x.get("step_order") or 0)


def _baseline_sequence_for_snapshot(snapshot: Snapshot) -> List[str]:
    """Get ordered tool name list from snapshot for behavior diff baseline."""
    raw = getattr(snapshot, "tool_calls_summary", None)
    if isinstance(raw, list):
        return tool_calls_summary_to_sequence(raw)
    return []


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


def _collect_replay_error_messages(results: List[Dict[str, Any]], limit: int = 3) -> List[str]:
    msgs: List[str] = []
    for r in results:
        if r.get("success"):
            continue
        msg = (
            str(r.get("error_user_message") or "").strip()
            or str(r.get("error") or "").strip()
            or "Replay request failed."
        )
        if msg and msg not in msgs:
            msgs.append(msg)
        if len(msgs) >= limit:
            break
    return msgs


def _normalize_provider(value: Any) -> Optional[str]:
    provider = str(value or "").strip().lower()
    if provider in SUPPORTED_REPLAY_PROVIDERS:
        return provider
    return None


def _infer_provider_from_model(model: Any) -> Optional[str]:
    m = str(model or "").strip().lower()
    if not m:
        return None
    if "claude" in m or m.startswith("anthropic/"):
        return "anthropic"
    if (
        "gemini" in m
        or "google" in m
        or m.startswith("models/gemini")
        or m.startswith("google/")
    ):
        return "google"
    return "openai"


def _resolve_snapshot_provider(snapshot: Snapshot) -> Optional[str]:
    provider = _normalize_provider(getattr(snapshot, "provider", None))
    if provider:
        return provider
    return _infer_provider_from_model(getattr(snapshot, "model", None))


async def _run_release_gate(
    project_id: int, payload: ReleaseGateValidateRequest, db: Session
) -> Dict[str, Any]:
    trace_id = payload.trace_id
    baseline_trace_id = payload.baseline_trace_id
    snapshot_ids_to_use: Optional[List[Any]] = None
    enforce_dataset_node_scope = False
    selected_dataset_agent_id: Optional[str] = (
        str(payload.agent_id).strip() if str(payload.agent_id or "").strip() else None
    )
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
        enforce_dataset_node_scope = True
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
        non_empty_dataset_agent_ids = sorted(
            {
                str(ds.agent_id).strip()
                for ds in datasets
                if str(ds.agent_id or "").strip()
            }
        )
        if selected_dataset_agent_id:
            mismatched_dataset_ids = [
                ds.id
                for ds in datasets
                if str(ds.agent_id or "").strip()
                and str(ds.agent_id).strip() != selected_dataset_agent_id
            ]
            if mismatched_dataset_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "error_code": "dataset_agent_mismatch",
                        "message": "Selected datasets must belong to the currently selected node.",
                        "expected_agent_id": selected_dataset_agent_id,
                        "dataset_ids": mismatched_dataset_ids[:20],
                    },
                )
        elif len(non_empty_dataset_agent_ids) > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error_code": "dataset_agent_mismatch",
                    "message": "Selected datasets span multiple nodes. Please select datasets from one node only.",
                    "agent_ids": non_empty_dataset_agent_ids,
                },
            )
        elif len(non_empty_dataset_agent_ids) == 1:
            selected_dataset_agent_id = non_empty_dataset_agent_ids[0]

        for ds in datasets:
            if ds.snapshot_ids:
                snapshot_ids_to_use.extend(ds.snapshot_ids)
        # Keep order while removing duplicates.
        dedup_snapshot_ids: List[Any] = []
        seen_snapshot_ids = set()
        for sid in snapshot_ids_to_use:
            sid_key = str(sid)
            if sid_key in seen_snapshot_ids:
                continue
            seen_snapshot_ids.add(sid_key)
            dedup_snapshot_ids.append(sid)
        snapshot_ids_to_use = dedup_snapshot_ids
        
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
        if enforce_dataset_node_scope:
            snapshot_agent_ids = sorted(
                {
                    str(getattr(s, "agent_id", "") or "").strip()
                    for s in snapshots
                    if str(getattr(s, "agent_id", "") or "").strip()
                }
            )
            if selected_dataset_agent_id:
                mismatched_snapshot_ids = [
                    s.id
                    for s in snapshots
                    if str(getattr(s, "agent_id", "") or "").strip() != selected_dataset_agent_id
                ]
                if mismatched_snapshot_ids:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail={
                            "error_code": "dataset_snapshot_agent_mismatch",
                            "message": "Selected datasets include logs from another node.",
                            "expected_agent_id": selected_dataset_agent_id,
                            "snapshot_ids": mismatched_snapshot_ids[:20],
                        },
                    )
            elif len(snapshot_agent_ids) > 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "error_code": "dataset_snapshot_agent_mismatch",
                        "message": "Selected datasets include logs from multiple nodes.",
                        "agent_ids": snapshot_agent_ids,
                    },
                )
            elif len(snapshot_agent_ids) == 1:
                selected_dataset_agent_id = snapshot_agent_ids[0]
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

    use_platform_model = payload.model_source == "platform"

    explicit_provider = _normalize_provider(payload.replay_provider)
    if use_platform_model and not explicit_provider:
        inferred_provider = _infer_provider_from_model(payload.new_model)
        if inferred_provider:
            explicit_provider = inferred_provider
    if payload.replay_provider and not explicit_provider:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported replay_provider. Use one of: openai, anthropic, google.",
        )
    if use_platform_model and not explicit_provider:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Platform model mode requires replay_provider or provider-inferrable new_model.",
        )

    unresolved_snapshot_ids: List[int] = []
    if not explicit_provider:
        for snapshot in snapshots:
            resolved = _resolve_snapshot_provider(snapshot)
            if not resolved:
                unresolved_snapshot_ids.append(snapshot.id)
                continue

    if unresolved_snapshot_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "provider_resolution_failed",
                "message": "Could not resolve provider for one or more selected snapshots.",
                "snapshot_ids": unresolved_snapshot_ids[:20],
            },
        )

    if not use_platform_model:
        key_service = UserApiKeyService(db)
        key_presence_cache: Dict[Tuple[str, Optional[str]], bool] = {}

        def _has_effective_provider_key(provider: str, agent_id: Optional[str]) -> bool:
            normalized_agent_id = str(agent_id or "").strip() or None
            cache_key = (provider, normalized_agent_id)
            if cache_key in key_presence_cache:
                return key_presence_cache[cache_key]
            exists = bool(key_service.get_user_api_key(project_id, provider, normalized_agent_id))
            key_presence_cache[cache_key] = exists
            return exists

        missing_provider_keys_set: Set[str] = set()
        if explicit_provider:
            for snapshot in snapshots:
                if not _has_effective_provider_key(explicit_provider, getattr(snapshot, "agent_id", None)):
                    missing_provider_keys_set.add(explicit_provider)
        else:
            for snapshot in snapshots:
                resolved_provider = _resolve_snapshot_provider(snapshot)
                if not resolved_provider:
                    continue
                if not _has_effective_provider_key(resolved_provider, getattr(snapshot, "agent_id", None)):
                    missing_provider_keys_set.add(resolved_provider)

        missing_provider_keys = sorted(missing_provider_keys_set)
        if missing_provider_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error_code": "missing_provider_keys",
                    "missing_provider_keys": missing_provider_keys,
                    "message": "Missing API keys for required providers.",
                },
            )

    rules_query = db.query(BehaviorRule).filter(BehaviorRule.project_id == project_id)
    if payload.rule_ids:
        rules_query = rules_query.filter(BehaviorRule.id.in_(payload.rule_ids))
    else:
        rules_query = rules_query.filter(BehaviorRule.enabled.is_(True))
    rules = rules_query.order_by(BehaviorRule.created_at.asc()).all()
    baseline_steps: List[Dict[str, Any]] = []

    if payload.evaluation_mode == "replay_test":
        snapshot_by_id: Dict[int, Snapshot] = {s.id: s for s in snapshots}
        attempts_by_snapshot: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
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
                replay_provider=payload.replay_provider,
                api_key=None,
                rubric=None,
                project_id=project_id,
                db=db,
                allow_environment_key=use_platform_model,
                prefer_environment_key=use_platform_model,
            )

            for res in replay_results:
                snapshot = snapshot_by_id.get(res.get("snapshot_id"))
                if not snapshot:
                    continue

                run_tool_summary = response_to_canonical_tool_calls_summary(
                    res.get("response_data") or {}, res.get("replay_provider")
                )
                baseline_seq = _baseline_sequence_for_snapshot(snapshot)
                candidate_seq = tool_calls_summary_to_sequence(run_tool_summary)
                behavior_diff = compute_behavior_diff(baseline_seq, candidate_seq).to_dict()

                if not res.get("success"):
                    replay_error_msgs = _collect_replay_error_messages([res], limit=1)
                    reasons = replay_error_msgs or ["Replay request failed."]
                    replay_error_code = str(res.get("error_code") or "").strip() or None
                    replay_provider = str(res.get("replay_provider") or "").strip() or None
                    attempts_by_snapshot[snapshot.id].append(
                        {
                            "run_index": run_idx + 1,
                            "trace_id": snapshot.trace_id,
                            "pass": False,
                            "failure_reasons": reasons,
                            "violations": [],
                            "summary": {},
                            "eval_elements_passed": [],
                            "eval_elements_failed": [],
                            "replay": {
                                "attempted": 1,
                                "succeeded": 0,
                                "failed": 1,
                                "avg_latency_ms": None,
                                "failed_snapshot_ids": [snapshot.id],
                                "error_messages": replay_error_msgs,
                                "error_codes": [replay_error_code] if replay_error_code else [],
                                "missing_provider_keys": (
                                    [replay_provider]
                                    if replay_error_code == "missing_api_key" and replay_provider
                                    else []
                                ),
                            },
                            "has_tool_calls": len(run_tool_summary) > 0,
                            "tool_calls_summary": run_tool_summary,
                            "behavior_diff": behavior_diff,
                        }
                    )
                    all_reasons.extend(reasons)
                    continue

                candidate_steps = _build_replay_candidate_steps([snapshot], [res])
                if not candidate_steps:
                    replay_error_msgs = _collect_replay_error_messages([res], limit=1)
                    reason = (
                        f"Replay produced no candidate steps: {replay_error_msgs[0]}"
                        if replay_error_msgs
                        else "Replay produced no candidate steps"
                    )
                    attempts_by_snapshot[snapshot.id].append(
                        {
                            "run_index": run_idx + 1,
                            "trace_id": snapshot.trace_id,
                            "pass": False,
                            "failure_reasons": [reason],
                            "violations": [],
                            "summary": {},
                            "eval_elements_passed": [],
                            "eval_elements_failed": [],
                            "replay": {
                                "attempted": 1,
                                "succeeded": 0,
                                "failed": 1,
                                "avg_latency_ms": None,
                                "failed_snapshot_ids": [snapshot.id],
                                "error_messages": replay_error_msgs,
                                "error_codes": [],
                                "missing_provider_keys": [],
                            },
                            "has_tool_calls": len(run_tool_summary) > 0,
                            "tool_calls_summary": run_tool_summary,
                            "behavior_diff": behavior_diff,
                        }
                    )
                    all_reasons.append(reason)
                    continue

                candidate_rules, candidate_policy_resolution = _resolve_effective_rules(
                    rules, candidate_steps
                )
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
                if reasons:
                    all_reasons.extend(reasons)

                enriched_violations = _append_violation_context(candidate_violations, candidate_steps)
                tr_passed, tr_failed = _eval_elements_passed_failed(candidate_rules, candidate_violations)
                avg_latency_ms = (
                    float(res.get("latency_ms"))
                    if res.get("latency_ms") is not None
                    else None
                )
                attempts_by_snapshot[snapshot.id].append(
                    {
                        "run_index": run_idx + 1,
                        "trace_id": snapshot.trace_id,
                        "pass": run_pass,
                        "failure_reasons": reasons,
                        "violations": enriched_violations,
                        "summary": candidate_summary,
                        "eval_elements_passed": tr_passed,
                        "eval_elements_failed": tr_failed,
                        "replay": {
                            "attempted": 1,
                            "succeeded": 1,
                            "failed": 0,
                            "avg_latency_ms": avg_latency_ms,
                            "failed_snapshot_ids": [],
                            "error_messages": [],
                            "error_codes": [],
                            "missing_provider_keys": [],
                        },
                        "has_tool_calls": len(run_tool_summary) > 0,
                        "tool_calls_summary": run_tool_summary,
                        "behavior_diff": behavior_diff,
                    }
                )

        case_results: List[Dict[str, Any]] = []
        for snapshot in snapshots:
            attempts = sorted(
                attempts_by_snapshot.get(snapshot.id, []),
                key=lambda x: x.get("run_index") or 0,
            )
            if not attempts:
                continue

            total_attempts = len(attempts)
            passed_attempts = sum(1 for a in attempts if a.get("pass"))
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
                float((a.get("replay") or {}).get("avg_latency_ms"))
                for a in attempts
                if (a.get("replay") or {}).get("avg_latency_ms") is not None
            ]
            latency_min_ms = min(latencies) if latencies else None
            latency_max_ms = max(latencies) if latencies else None

            failed_rule_counts: Dict[str, int] = {}
            passed_rule_ids: Set[str] = set()
            failed_reasons: List[str] = []
            replay_error_messages: List[str] = []
            replay_error_codes: List[str] = []
            missing_provider_keys: List[str] = []
            tool_summary_agg: List[Dict[str, Any]] = []
            all_violations: List[Dict[str, Any]] = []
            error_attempt_count = 0

            for a in attempts:
                for item in a.get("eval_elements_passed") or []:
                    rid = str(item.get("rule_id") or "")
                    if rid:
                        passed_rule_ids.add(rid)
                for item in a.get("eval_elements_failed") or []:
                    rid = str(item.get("rule_id") or "")
                    if not rid:
                        continue
                    failed_rule_counts[rid] = failed_rule_counts.get(rid, 0) + int(
                        item.get("violation_count") or 1
                    )
                for msg in a.get("failure_reasons") or []:
                    if msg and msg not in failed_reasons:
                        failed_reasons.append(str(msg))
                for msg in (a.get("replay") or {}).get("error_messages") or []:
                    if msg and msg not in replay_error_messages:
                        replay_error_messages.append(str(msg))
                for code in (a.get("replay") or {}).get("error_codes") or []:
                    code_str = str(code or "").strip()
                    if code_str and code_str not in replay_error_codes:
                        replay_error_codes.append(code_str)
                for provider in (a.get("replay") or {}).get("missing_provider_keys") or []:
                    provider_str = str(provider or "").strip()
                    if provider_str and provider_str not in missing_provider_keys:
                        missing_provider_keys.append(provider_str)
                if int((a.get("replay") or {}).get("failed") or 0) > 0:
                    error_attempt_count += 1
                for tc in a.get("tool_calls_summary") or []:
                    if tc not in tool_summary_agg:
                        tool_summary_agg.append(tc)
                all_violations.extend(a.get("violations") or [])

            eval_elements_failed = [
                {
                    "rule_id": rid,
                    "rule_name": next(
                        (
                            v.get("rule_name")
                            for v in all_violations
                            if v.get("rule_id") == rid and v.get("rule_name")
                        ),
                        rid,
                    ),
                    "violation_count": count,
                }
                for rid, count in sorted(failed_rule_counts.items())
            ]
            eval_elements_failed_ids = {item["rule_id"] for item in eval_elements_failed}
            eval_elements_passed = [
                {"rule_id": rid, "rule_name": rid}
                for rid in sorted(passed_rule_ids - eval_elements_failed_ids)
            ]
            pass_ratio = passed_attempts / total_attempts if total_attempts else 0.0

            case_results.append(
                {
                    "run_index": len(case_results) + 1,
                    "trace_id": snapshot.trace_id,
                    "snapshot_id": snapshot.id,
                    "pass": case_status == "pass",
                    "case_status": case_status,
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
                    "eval_elements_passed": eval_elements_passed,
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
                    },
                    "has_tool_calls": len(tool_summary_agg) > 0,
                    "tool_calls_summary": tool_summary_agg[:20],
                    "attempts": attempts,
                }
            )

        if not case_results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No snapshot data found to run Replay Test.",
            )

        total_cases = len(case_results)
        failed_cases = sum(1 for r in case_results if r.get("case_status") == "fail")
        flaky_cases = sum(1 for r in case_results if r.get("case_status") == "flaky")
        fail_rate = failed_cases / total_cases if total_cases else 0.0
        flaky_rate = flaky_cases / total_cases if total_cases else 0.0
        ratio_band = _ratio_band(fail_rate)
        gate_pass = fail_rate <= payload.fail_rate_max and flaky_rate <= payload.flaky_rate_max

        primary_case = next((r for r in case_results if r.get("case_status") != "pass"), case_results[0])
        primary_summary = dict(primary_case.get("summary", {}))
        primary_summary["target"] = {
            "type": "release_gate_snapshot",
            "trace_id": primary_case.get("trace_id") or trace_id,
            "baseline_trace_id": baseline_trace_id,
            "snapshot_id": primary_case.get("snapshot_id"),
        }
        primary_summary["release_gate"] = {
            "mode": "replay_test",
            "repeat_runs": payload.repeat_runs,
            "total_inputs": total_cases,
            "failed_inputs": failed_cases,
            "flaky_inputs": flaky_cases,
            "fail_rate": round(fail_rate, 4),
            "flaky_rate": round(flaky_rate, 4),
            "ratio_band": ratio_band,
            "thresholds": {
                "fail_rate_max": payload.fail_rate_max,
                "flaky_rate_max": payload.flaky_rate_max,
            },
        }
        report = BehaviorReport(
            project_id=project_id,
            trace_id=primary_case.get("trace_id") or trace_id,
            agent_id=(snapshots[0].agent_id if snapshots else _derive_agent_id(baseline_steps)),
            baseline_run_ref=baseline_trace_id,
            ruleset_hash=primary_summary.get("ruleset_hash"),
            status="pass" if gate_pass else "fail",
            summary_json=primary_summary,
            violations_json=primary_case.get("violations") or [],
        )
        db.add(report)
        db.commit()
        db.refresh(report)

        unique_reasons = list(dict.fromkeys(all_reasons))
        replay_error_codes_global = list(
            dict.fromkeys(
                code
                for run in case_results
                for code in ((run.get("replay") or {}).get("error_codes") or [])
                if code
            )
        )
        missing_provider_keys_global = list(
            dict.fromkeys(
                provider
                for run in case_results
                for provider in ((run.get("replay") or {}).get("missing_provider_keys") or [])
                if provider
            )
        )
        failed_signals = list(
            dict.fromkeys(
                v.get("rule_id")
                for run in case_results
                for v in (run.get("violations") or [])
                if v.get("rule_id")
            )
        )

        threshold_text = (
            f"fail<={int(payload.fail_rate_max * 100)}%, flaky<={int(payload.flaky_rate_max * 100)}%"
        )
        return {
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
            "report_id": report.id,
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
            "replay_error_codes": replay_error_codes_global,
            "missing_provider_keys": missing_provider_keys_global,
            "run_results": case_results,
            "case_results": case_results,
            "evidence_pack": {
                "top_regressed_rules": [],
                "first_violations": (primary_case.get("violations") or [])[:5],
                "failed_replay_snapshot_ids": (
                    (primary_case.get("replay") or {}).get("failed_snapshot_ids") or []
                ),
                "sample_failure_reasons": unique_reasons[:5],
            },
        }

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported evaluation_mode: {payload.evaluation_mode}",
    )


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
            Snapshot.user_message,
            Snapshot.response,
            Snapshot.eval_checks_result,
            Snapshot.eval_config_version,
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
            "user_message": getattr(r, "user_message", None),
            "response": getattr(r, "response", None),
            "eval_checks_result": getattr(r, "eval_checks_result", None),
            "eval_config_version": getattr(r, "eval_config_version", None),
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
    allowed, err_msg = check_guard_credits_limit(db, current_user.id, getattr(current_user, "is_superuser", False))
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=err_msg)
    return await _run_release_gate(project_id, payload, db)


@router.post("/projects/{project_id}/release-gate/webhook")
async def release_gate_webhook(
    project_id: int,
    payload: ReleaseGateValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_from_api_key),
):
    check_project_access(project_id, current_user, db)
    allowed, err_msg = check_guard_credits_limit(db, current_user.id, getattr(current_user, "is_superuser", False))
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=err_msg)
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
                "mode": gate_meta.get("mode", "replay_test"),
                "repeat_runs": gate_meta.get("repeat_runs"),
                "passed_runs": gate_meta.get("passed_runs"),
                "failed_runs": gate_meta.get("failed_runs"),
                "thresholds": gate_meta.get("thresholds"),
            }
        )

    return {"items": items, "total": total, "limit": limit, "offset": offset}

