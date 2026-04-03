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

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Literal, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import String, and_, cast, desc, func
from sqlalchemy.orm import Session

from app.api.v1.endpoints.behavior import (
    _append_violation_context,
    _build_ruleset_hash,
    _derive_agent_id,
    _iso,
)
from app.core.behavior_diff import compute_behavior_diff, tool_calls_summary_to_sequence
from app.core.canonical import (
    response_to_canonical_steps,
    response_to_canonical_tool_calls_summary,
)
from app.core.database import SessionLocal, get_db
from app.core.logging_config import logger
from app.core.metrics import (
    realtime_stream_connections_active,
    realtime_stream_connections_opened_total,
)
from app.core.permissions import (
    check_project_access,
    check_project_write_access,
    get_user_organization_role,
)
from app.core.config import settings as app_settings
from app.core.usage_limits import check_release_gate_attempts_limit, get_limit_status
from app.core.security import (
    TokenValidationError,
    auth_error_detail,
    decode_token_or_raise,
    get_current_user,
    get_user_from_api_key,
    oauth2_scheme,
)
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.behavior_report import BehaviorReport
from app.models.behavior_rule import BehaviorRule
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.release_gate_job import ReleaseGateJob
from app.models.release_gate_run import ReleaseGateRun
from app.models.snapshot import Snapshot
from app.models.user import User
from app.models.user_api_key import UserApiKey
from app.models.validation_dataset import ValidationDataset
from app.services.data_lifecycle_service import DataLifecycleService
from app.domain.live_view_release_gate import build_agent_visibility_context, is_agent_hidden
from app.domain.live_view_release_gate.hot_path_auth import resolve_hot_path_user_id
from app.domain.live_view_release_gate.release_gate_history import (
    build_release_gate_history_session_result as _history_build_release_gate_history_session_result,
    build_release_gate_run_record as _history_build_release_gate_run_record,
    resolve_release_gate_run_agent_id as _history_resolve_release_gate_run_agent_id,
)
from app.domain.live_view_release_gate.release_gate_hot_access import (
    ensure_release_gate_hot_path_access as _domain_ensure_release_gate_hot_path_access,
)
from app.services.ops_alerting import ops_alerting
from app.services.replay_service import replay_service, resolve_tool_context_injection_text
from app.services.data_normalizer import DataNormalizer
from app.services.subscription_service import SubscriptionService
from app.services.user_api_key_service import UserApiKeyService
from app.services.cache_service import cache_service
from app.services.release_gate_job_support import merge_result_perf_with_job_summary
from app.services.release_gate_preflight import resolve_release_gate_provider_context
from app.services.release_gate_result_assembly import (
    build_release_gate_case_result,
    build_release_gate_final_payload,
)
from app.services.release_gate_signal_details import build_release_gate_signal_details
from app.services.release_gate_events import (
    invalidate_release_gate_job_poll_cache,
    publish_release_gate_job_updated,
    release_gate_job_events_channel,
    release_gate_job_status_cache_key,
)
from app.services.behavior_rules_service import (
    resolve_effective_rules,
    run_behavior_validation,
)
from app.services.live_eval_service import (
    CHECK_KEYS,
    evaluate_one_snapshot_at_save,
    eval_config_version_hash,
    normalize_eval_config,
    strip_eval_window,
)
from app.utils.tool_events import normalize_tool_events

router = APIRouter()
SUPPORTED_REPLAY_PROVIDERS = {"openai", "anthropic", "google"}
# Hosted (platform) quick-pick models only — cost-controlled. Premium / Pro models use Custom + BYOK.
CORE_REPLAY_MODELS: Dict[str, List[str]] = {
    "openai": [
        "gpt-4o-mini",
        "gpt-4.1-mini",
    ],
    "anthropic": [
        "claude-haiku-4-5-20251001",
    ],
    "google": [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ],
}


def _hosted_platform_model_allowed(provider: Optional[str], model_id: Any) -> bool:
    p = _normalize_provider(provider)
    if not p:
        return False
    mid = str(model_id or "").strip()
    if not mid:
        return False
    allowed = CORE_REPLAY_MODELS.get(p) or []
    return mid in allowed


def _hosted_platform_policy_bypass(current_user: Optional[User]) -> bool:
    if current_user and bool(getattr(current_user, "is_superuser", False)):
        return True
    return bool(getattr(app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False))


class ReleaseGateCancelled(Exception):
    pass


def _tool_evidence_stats_from_gate_result(result: Optional[Dict[str, Any]]) -> Tuple[int, int]:
    """Return (total tool_evidence rows, rows with execution_source/status missing)."""
    total = 0
    missing = 0
    if not isinstance(result, dict):
        return 0, 0
    for case in result.get("case_results") or []:
        if not isinstance(case, dict):
            continue
        for att in case.get("attempts") or []:
            if not isinstance(att, dict):
                continue
            for row in att.get("tool_evidence") or []:
                if not isinstance(row, dict):
                    continue
                total += 1
                exec_src = str(row.get("execution_source") or "").strip().lower()
                status = str(row.get("status") or "").strip().lower()
                if exec_src == "missing" or (not exec_src and status == "missing"):
                    missing += 1
    return total, missing


def _is_pinned_anthropic_model_id(model_id: Any) -> bool:
    """
    Anthropic pinned model ids are versioned snapshots ending in YYYYMMDD.
    Examples: claude-sonnet-4-20250514, claude-haiku-4-5-20251001
    """
    s = str(model_id or "").strip()
    if not s:
        return False
    return bool(re.search(r"-\d{8}$", s))


def _should_block_release_gate_custom_model(
    provider: Optional[str], model_id: Any, current_user: Optional[User]
) -> bool:
    """
    Option A policy:
    - In production, Release Gate should require pinned model ids for Anthropic.
    - Escape hatches:
      - current_user.is_superuser
      - RELEASE_GATE_ALLOW_CUSTOM_MODELS=true
    """
    if provider != "anthropic":
        return False
    s = str(model_id or "").strip()
    if not s:
        return False
    is_production = str(app_settings.ENVIRONMENT).strip().lower() == "production"
    if not is_production:
        return False
    if bool(getattr(current_user, "is_superuser", False)):
        return False
    if bool(getattr(app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False)):
        return False
    return not _is_pinned_anthropic_model_id(s)


def _safe_preview_json(value: Any, max_chars: int = 12000) -> Optional[str]:
    """
    Best-effort stringify for UI diagnostics. Truncates to keep responses bounded.
    """
    if value is None:
        return None
    try:
        if isinstance(value, (dict, list)):
            text = json.dumps(value, ensure_ascii=False, indent=2)
        else:
            text = str(value)
    except Exception:
        try:
            text = str(value)
        except Exception:
            return None
    text = text.strip()
    if not text:
        return None
    if len(text) > max_chars:
        return text[:max_chars] + "\n…(truncated)…"
    return text


def _preview_text_snippet(text: str, max_chars: int = 500) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[:max_chars] + "…"


def _build_captured_customer_material_from_snapshot(snapshot: Snapshot) -> Dict[str, Any]:
    """
    A: Tool result text captured at ingest (payload.tool_events), if any.
    """
    payload = snapshot.payload if isinstance(getattr(snapshot, "payload", None), dict) else {}
    evs = normalize_tool_events(payload.get("tool_events"))
    if not evs:
        return {
            "present": False,
            "sources": [],
            "tool_result_excerpt_chars": 0,
            "preview": None,
        }
    parts: List[str] = []
    for ev in evs:
        if str(ev.get("kind") or "").strip().lower() != "tool_result":
            continue
        out = ev.get("output")
        if isinstance(out, str):
            parts.append(out)
        elif out is not None:
            try:
                parts.append(json.dumps(out, ensure_ascii=False))
            except Exception:
                parts.append(str(out))
    combined = "\n\n---\n\n".join(parts)
    if not combined.strip():
        return {
            "present": False,
            "sources": ["snapshot.payload.tool_events"],
            "tool_result_excerpt_chars": 0,
            "preview": None,
        }
    return {
        "present": True,
        "sources": ["snapshot.payload.tool_events"],
        "tool_result_excerpt_chars": len(combined),
        "preview": _preview_text_snippet(combined, 500),
    }


def _build_rg_injection_report(
    tool_context_payload: Optional[Dict[str, Any]], snapshot_id: int
) -> Dict[str, Any]:
    """B: Release Gate inject — text merged into replay system prompt for this snapshot."""
    resolved = resolve_tool_context_injection_text(tool_context_payload, snapshot_id)
    if not resolved:
        return {
            "applied": False,
            "resolution": "none",
            "matched_key": None,
            "char_count": 0,
            "preview": None,
            "sha256": None,
        }
    inject: Dict[str, Any] = {}
    if isinstance(tool_context_payload, dict):
        raw = tool_context_payload.get("inject")
        if isinstance(raw, dict):
            inject = raw
    scope = str(inject.get("scope") or "per_snapshot").strip().lower()
    sid = str(snapshot_id)
    by_snapshot = inject.get("by_snapshot_id") or {}
    if not isinstance(by_snapshot, dict):
        by_snapshot = {}
    per_val = by_snapshot.get(sid)
    if isinstance(per_val, str) and per_val.strip():
        resolution = "per_snapshot"
        matched_key = sid
    elif scope == "global":
        resolution = "global"
        matched_key = None
    else:
        resolution = "per_snapshot_fallback"
        matched_key = None
    return {
        "applied": True,
        "resolution": resolution,
        "matched_key": matched_key,
        "char_count": len(resolved),
        "preview": _preview_text_snippet(resolved, 500),
        "sha256": hashlib.sha256(resolved.encode("utf-8")).hexdigest(),
    }


def _aggregate_tool_flow_from_attempts(attempts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """C/D: aggregate tool inbound/outbound previews from attempts[].tool_evidence."""
    recorded = 0
    simulated = 0
    rows_with_result = 0
    rows_with_args = 0
    for att in attempts or []:
        for row in att.get("tool_evidence") or []:
            if not isinstance(row, dict):
                continue
            st = str(row.get("status") or "").strip().lower()
            if st == "recorded":
                recorded += 1
            elif st == "simulated":
                simulated += 1
            rp = row.get("result_preview")
            if isinstance(rp, str) and rp.strip():
                rows_with_result += 1
            ap = row.get("arguments_preview")
            if ap is not None and str(ap).strip():
                rows_with_args += 1
    return {
        "C_tool_inbound": {
            "summary": {
                "recorded_rows": recorded,
                "simulated_rows": simulated,
                "rows_with_result_preview": rows_with_result,
            },
            "detail": "attempts[].tool_evidence[].result_preview",
        },
        "D_tool_outbound": {
            "summary": {"rows_with_arguments_preview": rows_with_args},
            "detail": "attempts[].tool_evidence[].arguments_preview",
        },
    }


_GROUNDING_STOPWORDS: Set[str] = {
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "into",
    "your",
    "have",
    "has",
    "were",
    "was",
    "will",
    "would",
    "about",
    "after",
    "before",
    "there",
    "their",
    "they",
    "them",
    "then",
    "than",
    "http",
    "https",
    "www",
    "json",
    "true",
    "false",
    "null",
    "none",
    "tool",
    "tools",
    "result",
    "results",
    "response",
    "content",
    "message",
    "status",
    "value",
    "data",
    "items",
    "item",
    "text",
}


def _normalize_grounding_text(value: Any) -> str:
    text = str(value or "").lower()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_grounding_tokens(value: Any, max_tokens: int = 8) -> List[str]:
    text = _normalize_grounding_text(value)
    if not text:
        return []
    raw_tokens = re.findall(r"[a-z0-9][a-z0-9._:/-]{2,}", text)
    out: List[str] = []
    seen: Set[str] = set()
    for token in raw_tokens:
        if token in seen:
            continue
        if token in _GROUNDING_STOPWORDS:
            continue
        if token.isdigit():
            continue
        if len(token) < 4 and not any(ch.isdigit() for ch in token):
            continue
        seen.add(token)
        out.append(token)
        if len(out) >= max_tokens:
            break
    return out


def _assess_tool_grounding(
    tool_evidence: List[Dict[str, Any]],
    candidate_response_preview: Any,
    tool_loop_status: Any,
) -> Dict[str, Any]:
    tool_total_calls = len(tool_evidence or [])
    response_text = str(candidate_response_preview or "").strip()
    response_present = bool(response_text)
    loop_status = str(tool_loop_status or "").strip().lower()

    result_rows = [
        row
        for row in (tool_evidence or [])
        if isinstance(row, dict) and str(row.get("result_preview") or "").strip()
    ]
    tool_result_count = len(result_rows)

    if tool_total_calls <= 0:
        return {
            "status": "not_applicable",
            "reason": "No tool calls detected for this attempt.",
            "tool_calls": 0,
            "tool_results": 0,
            "loop_status": loop_status or None,
            "response_present": response_present,
            "grounded_rows": 0,
            "evaluated_rows": 0,
            "coverage_ratio": None,
            "matched_tokens": [],
            "expected_tokens": [],
        }

    if tool_result_count <= 0:
        return {
            "status": "fail",
            "reason": "Tool calls were detected but no tool results were captured.",
            "tool_calls": tool_total_calls,
            "tool_results": 0,
            "loop_status": loop_status or None,
            "response_present": response_present,
            "grounded_rows": 0,
            "evaluated_rows": 0,
            "coverage_ratio": 0.0,
            "matched_tokens": [],
            "expected_tokens": [],
        }

    if not response_present:
        return {
            "status": "fail",
            "reason": "Tool results were captured, but no final assistant response text was produced.",
            "tool_calls": tool_total_calls,
            "tool_results": tool_result_count,
            "loop_status": loop_status or None,
            "response_present": False,
            "grounded_rows": 0,
            "evaluated_rows": tool_result_count,
            "coverage_ratio": 0.0,
            "matched_tokens": [],
            "expected_tokens": [],
        }

    if loop_status in {"provider_error", "network_error", "id_conflict", "max_rounds_exceeded"}:
        return {
            "status": "fail",
            "reason": f"Tool loop ended with status '{loop_status}', so grounding confidence is low.",
            "tool_calls": tool_total_calls,
            "tool_results": tool_result_count,
            "loop_status": loop_status,
            "response_present": True,
            "grounded_rows": 0,
            "evaluated_rows": tool_result_count,
            "coverage_ratio": 0.0,
            "matched_tokens": [],
            "expected_tokens": [],
        }

    normalized_response = _normalize_grounding_text(response_text)
    response_tokens = set(_extract_grounding_tokens(response_text, max_tokens=64))
    grounded_rows = 0
    matched_tokens: List[str] = []
    expected_tokens: List[str] = []

    for row in result_rows:
        preview = str(row.get("result_preview") or "").strip()
        tokens = _extract_grounding_tokens(preview, max_tokens=8)
        direct_match = False
        normalized_preview = _normalize_grounding_text(preview)
        if 12 <= len(normalized_preview) <= 160 and normalized_preview in normalized_response:
            direct_match = True
        overlap = [token for token in tokens if token in response_tokens or token in normalized_response]
        row_expected = tokens[:4]
        for token in row_expected:
            if token not in expected_tokens:
                expected_tokens.append(token)
        if direct_match or (len(tokens) <= 2 and len(overlap) >= 1) or (len(tokens) >= 3 and len(overlap) >= 2):
            grounded_rows += 1
            for token in overlap[:3]:
                if token not in matched_tokens:
                    matched_tokens.append(token)

    coverage_ratio = grounded_rows / tool_result_count if tool_result_count > 0 else 0.0
    if grounded_rows > 0 and coverage_ratio >= 0.5:
        reason = (
            f"Tool-result grounding matched {grounded_rows}/{tool_result_count} result row"
            f"{'' if tool_result_count == 1 else 's'}."
        )
        if matched_tokens:
            reason += f" Matched tokens: {', '.join(matched_tokens[:4])}."
        status = "pass"
    else:
        reason = (
            f"Tool results were captured, but the final response did not show enough overlap "
            f"with tool evidence ({grounded_rows}/{tool_result_count} rows matched)."
        )
        if expected_tokens:
            reason += f" Expected signals included: {', '.join(expected_tokens[:4])}."
        status = "fail"

    return {
        "status": status,
        "reason": reason,
        "tool_calls": tool_total_calls,
        "tool_results": tool_result_count,
        "loop_status": loop_status or None,
        "response_present": True,
        "grounded_rows": grounded_rows,
        "evaluated_rows": tool_result_count,
        "coverage_ratio": round(coverage_ratio, 4),
        "matched_tokens": matched_tokens[:6],
        "expected_tokens": expected_tokens[:6],
    }


def _build_tool_evidence_grounding_text(
    tool_evidence: List[Dict[str, Any]],
    max_items: int = 4,
) -> str:
    lines: List[str] = []
    for idx, row in enumerate(tool_evidence or [], start=1):
        if idx > max_items:
            break
        if not isinstance(row, dict):
            continue
        tool_name = str(row.get("name") or "unknown_tool").strip()
        result_preview = str(row.get("result_preview") or "").strip()
        if not result_preview:
            continue
        lines.append(f"{idx}. {tool_name}: {result_preview[:800]}")
    return "\n".join(lines).strip()


async def _run_semantic_tool_grounding_judge(
    *,
    tool_evidence: List[Dict[str, Any]],
    candidate_response_preview: Any,
    project_id: int,
    agent_id: Optional[str],
    db: Session,
    judge_model: str = "gpt-4o-mini",
) -> Dict[str, Any]:
    response_text = str(candidate_response_preview or "").strip()
    evidence_text = _build_tool_evidence_grounding_text(tool_evidence)
    if not evidence_text or not response_text:
        return {
            "status": "unavailable",
            "reason": "Semantic grounding judge skipped because evidence or final response text was missing.",
            "judge_model": judge_model,
        }

    user_api_key = None
    try:
        user_api_key = UserApiKeyService(db).get_user_api_key(project_id, "openai", agent_id)
    except Exception:
        user_api_key = None

    if not user_api_key and not getattr(app_settings, "OPENAI_API_KEY", None):
        return {
            "status": "unavailable",
            "reason": "Semantic grounding judge is unavailable because no OpenAI judge key is configured.",
            "judge_model": judge_model,
        }

    from app.services.judge_service import judge_service

    raw = await judge_service.evaluate_grounding(
        tool_evidence_text=evidence_text,
        final_response_text=response_text,
        judge_model=judge_model,
        user_api_key=user_api_key,
    )
    if not isinstance(raw, dict) or raw.get("error"):
        return {
            "status": "unavailable",
            "reason": "Semantic grounding judge did not return a usable result.",
            "judge_model": judge_model,
        }

    grounded = bool(raw.get("grounded"))
    confidence = str(raw.get("confidence") or "").strip().lower() or "unknown"
    reasoning = str(raw.get("reasoning") or "").strip() or (
        "Semantic grounding judge found the response grounded."
        if grounded
        else "Semantic grounding judge found the response insufficiently grounded."
    )
    matched_facts = raw.get("matched_facts") if isinstance(raw.get("matched_facts"), list) else []
    missing_facts = raw.get("missing_facts") if isinstance(raw.get("missing_facts"), list) else []
    return {
        "status": "pass" if grounded else "fail",
        "reason": reasoning,
        "judge_confidence": confidence,
        "judge_model": judge_model,
        "matched_facts": [str(v).strip() for v in matched_facts if str(v).strip()][:4],
        "missing_facts": [str(v).strip() for v in missing_facts if str(v).strip()][:4],
    }


def _merge_tool_grounding_with_semantic(
    heuristic: Dict[str, Any],
    semantic: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    merged = dict(heuristic or {})
    if not semantic or not isinstance(semantic, dict):
        return merged

    semantic_status = str(semantic.get("status") or "").strip().lower() or "unavailable"
    merged["semantic_status"] = semantic_status
    merged["semantic_reason"] = str(semantic.get("reason") or "").strip() or None
    merged["semantic_confidence"] = str(semantic.get("judge_confidence") or "").strip() or None
    merged["semantic_model"] = str(semantic.get("judge_model") or "").strip() or None
    merged["matched_facts"] = semantic.get("matched_facts") if isinstance(semantic.get("matched_facts"), list) else []
    merged["missing_facts"] = semantic.get("missing_facts") if isinstance(semantic.get("missing_facts"), list) else []

    if semantic_status == "pass" and str(merged.get("status") or "").strip().lower() == "fail":
        merged["status"] = "pass"
        base_reason = str(merged.get("reason") or "").strip()
        semantic_reason = str(semantic.get("reason") or "").strip()
        merged["reason"] = (
            f"{base_reason} Semantic judge rescue: {semantic_reason}".strip()
            if base_reason
            else semantic_reason or "Semantic judge found the final response grounded in tool evidence."
        )
    elif semantic_status == "fail":
        merged["status"] = "fail"
        semantic_reason = str(semantic.get("reason") or "").strip()
        if semantic_reason:
            merged["reason"] = semantic_reason

    return merged


def _extract_release_gate_eval_config(value: Any) -> Dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    nested = raw.get("eval") if isinstance(raw.get("eval"), dict) else None
    if isinstance(nested, dict):
        return strip_eval_window(nested)
    return strip_eval_window(raw)


def _configured_eval_check_ids(eval_config: Any) -> List[str]:
    raw = _extract_release_gate_eval_config(eval_config)
    configured: List[str] = []
    for key in CHECK_KEYS:
        if key == "tool":
            value = raw.get("tool")
            if not isinstance(value, dict):
                value = raw.get("tool_use_policy")
        else:
            value = raw.get(key)
        if isinstance(value, dict) and value.get("enabled") is True:
            configured.append(key)
    return configured


def _build_release_gate_signals_payload(
    *,
    signals_checks: Optional[Dict[str, Any]],
    signals_details: Optional[Dict[str, Any]],
    eval_config_version: Optional[str],
    config_check_ids: List[str],
) -> Dict[str, Any]:
    canonical_checks: Dict[str, Any] = {}
    runtime_checks: Dict[str, Any] = {}
    for key, value in (signals_checks or {}).items():
        if key in CHECK_KEYS:
            canonical_checks[key] = value
        else:
            runtime_checks[key] = value

    canonical_details: Dict[str, Any] = {}
    runtime_details: Dict[str, Any] = {}
    for key, value in (signals_details or {}).items():
        if key in CHECK_KEYS:
            canonical_details[key] = value
        else:
            runtime_details[key] = value

    canonical_failed = [
        key for key, value in canonical_checks.items() if str(value).strip().lower() == "fail"
    ]

    return {
        "checks": canonical_checks,
        "failed": canonical_failed,
        "config_version": eval_config_version,
        "config_check_ids": config_check_ids,
        "details": canonical_details,
        "runtime_checks": runtime_checks,
        "runtime_details": runtime_details,
    }


DISALLOWED_REPLAY_OVERRIDE_KEYS: Set[str] = {
    # Content / trace fields that must not be overridden via replay_overrides.
    "messages",
    "message",
    "user_message",
    "response",
    "responses",
    "input",
    "inputs",
    "trace_id",
    "agent_id",
    "agent_name",
}


def _sanitize_replay_overrides(
    overrides: Optional[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """
    Keep replay_overrides focused on configuration-only fields.

    Snapshot content (messages/user_message/response), trace identifiers,
    and similar fields are always derived from the baseline snapshot, not
    from client-provided overrides. This helper removes such keys so that
    Release Gate cannot accidentally change the underlying test cases via
    replay_overrides.
    """
    if not overrides or not isinstance(overrides, dict):
        return overrides

    cleaned: Dict[str, Any] = {
        key: value
        for key, value in overrides.items()
        if key not in DISALLOWED_REPLAY_OVERRIDE_KEYS
    }
    return cleaned or None


def _sanitize_replay_overrides_by_snapshot_id(
    raw: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Dict[str, Any]]]:
    """Sanitize each inner dict; keys are string snapshot ids."""
    if not raw or not isinstance(raw, dict):
        return None
    out: Dict[str, Dict[str, Any]] = {}
    for k, v in raw.items():
        sk = str(k).strip()
        if not sk or not isinstance(v, dict):
            continue
        cleaned = _sanitize_replay_overrides(v)
        if cleaned:
            out[sk] = cleaned
    return out or None


def _snapshot_request_part(snapshot: Snapshot) -> Dict[str, Any]:
    """Return the provider request body from stored snapshot payload (proxy or flat)."""
    raw = snapshot.payload if isinstance(getattr(snapshot, "payload", None), dict) else {}
    req = raw.get("request")
    if isinstance(req, dict):
        return dict(req)
    return dict(raw)


def _build_replay_request_meta(
    snapshots: List[Snapshot],
    payload: Any,
) -> Dict[str, Any]:
    """
    Snapshot vs applied overrides for result UI: first snapshot's top-level request keys
    vs sanitized replay_overrides sent to the replay worker.
    """
    overrides = _sanitize_replay_overrides(getattr(payload, "replay_overrides", None)) or {}
    baseline_excerpt: Dict[str, Any] = {}
    if snapshots:
        req = _snapshot_request_part(snapshots[0])
        for k in overrides.keys():
            baseline_excerpt[k] = req[k] if k in req else None
    sampling: Dict[str, Any] = {}
    if getattr(payload, "replay_temperature", None) is not None:
        sampling["replay_temperature"] = payload.replay_temperature
    if getattr(payload, "replay_max_tokens", None) is not None:
        sampling["replay_max_tokens"] = payload.replay_max_tokens
    if getattr(payload, "replay_top_p", None) is not None:
        sampling["replay_top_p"] = payload.replay_top_p
    nsp = str(getattr(payload, "new_system_prompt", None) or "").strip()
    per_sid = _sanitize_replay_overrides_by_snapshot_id(
        getattr(payload, "replay_overrides_by_snapshot_id", None)
    )
    return {
        "replay_overrides_applied": overrides,
        "baseline_snapshot_excerpt": baseline_excerpt,
        "replay_overrides_by_snapshot_id_applied": per_sid,
        "sampling_overrides": sampling or None,
        "has_new_system_prompt": bool(nsp),
        "new_system_prompt_preview": (nsp[:240] + "…") if len(nsp) > 240 else (nsp or None),
    }


@dataclass(frozen=True)
class _ResolvedReleaseGateInputs:
    trace_id: Optional[str]
    baseline_trace_id: Optional[str]
    snapshots: List[Snapshot]


@dataclass(frozen=True)
class _ReplayBatchResult:
    run_index: int
    replay_results: List[Dict[str, Any]]
    batch_wall_ms: int
    avg_snapshot_latency_ms: Optional[float]
    succeeded: int
    failed: int


def _resolve_release_gate_parallel_repeat_limit(repeat_runs: int) -> int:
    total_runs = max(1, int(repeat_runs or 1))
    if not bool(getattr(app_settings, "RELEASE_GATE_ENABLE_PARALLEL_REPEATS", False)):
        return 1

    configured_limit = int(getattr(app_settings, "RELEASE_GATE_MAX_PARALLEL_REPEATS", 1) or 1)
    return max(1, min(total_runs, configured_limit))


async def _execute_release_gate_replay_batches(
    *,
    project_id: int,
    payload: "ReleaseGateValidateRequest",
    snapshots: List[Snapshot],
    db: Session,
    tool_context_payload: Optional[Dict[str, Any]],
    replay_user_api_key_override: Optional[str],
    use_platform_model: bool,
    cancel_check: Optional[Callable[[], bool]] = None,
    progress_hook: Optional[Callable[[int, Optional[int], Optional[str], Optional[Dict[str, Any]]], None]] = None,
) -> List[_ReplayBatchResult]:
    total_runs = max(1, int(payload.repeat_runs or 1))
    max_parallel_repeats = _resolve_release_gate_parallel_repeat_limit(total_runs)
    allow_env_fallback = bool(
        use_platform_model
        or app_settings.SELF_HOSTED_MODE
        or str(app_settings.ENVIRONMENT).lower() != "production"
    )
    replay_overrides = _sanitize_replay_overrides(payload.replay_overrides)
    replay_overrides_by_snapshot_id = _sanitize_replay_overrides_by_snapshot_id(
        payload.replay_overrides_by_snapshot_id
    )
    progress_lock = asyncio.Lock()
    progress_completed = 0
    semaphore = asyncio.Semaphore(max_parallel_repeats)

    async def _run_single_batch(run_index: int, run_db: Session) -> _ReplayBatchResult:
        nonlocal progress_completed
        t0 = time.monotonic()
        replay_results = await replay_service.run_batch_replay(
            snapshots=snapshots,
            new_model=payload.new_model,
            new_system_prompt=payload.new_system_prompt,
            temperature=payload.replay_temperature,
            max_tokens=payload.replay_max_tokens,
            top_p=payload.replay_top_p,
            replay_overrides=replay_overrides,
            replay_overrides_by_snapshot_id=replay_overrides_by_snapshot_id,
            tool_context=tool_context_payload,
            replay_provider=payload.replay_provider,
            api_key=replay_user_api_key_override if not use_platform_model else None,
            rubric=None,
            project_id=project_id,
            db=run_db,
            allow_environment_key=allow_env_fallback,
            # Platform mode prefers env keys (hosted). Detected mode uses DB keys first,
            # with env as a fallback (self-hosted/local convenience).
            prefer_environment_key=use_platform_model,
            track_platform_credits=use_platform_model,
        )
        wall_ms = int((time.monotonic() - t0) * 1000)
        latencies = [
            float(r.get("latency_ms"))
            for r in replay_results
            if r.get("latency_ms") is not None
        ]
        avg_latency_ms = (sum(latencies) / len(latencies)) if latencies else None
        succeeded = sum(1 for r in replay_results if r.get("success"))
        failed = len(replay_results) - succeeded

        if progress_hook:
            async with progress_lock:
                progress_completed += 1
                completed_count = progress_completed
            try:
                progress_hook(
                    completed_count,
                    total_runs or None,
                    "replay",
                    {
                        "run_index": run_index,
                        "batch_wall_ms": wall_ms,
                        "avg_snapshot_latency_ms": avg_latency_ms,
                    },
                )
            except Exception:
                # Progress reporting must never fail the run.
                pass

        return _ReplayBatchResult(
            run_index=run_index,
            replay_results=replay_results,
            batch_wall_ms=wall_ms,
            avg_snapshot_latency_ms=avg_latency_ms,
            succeeded=succeeded,
            failed=failed,
        )

    async def _run_batch(run_index: int) -> Optional[_ReplayBatchResult]:
        if cancel_check and cancel_check():
            return None

        if max_parallel_repeats <= 1:
            return await _run_single_batch(run_index, db)

        async with semaphore:
            if cancel_check and cancel_check():
                return None
            with SessionLocal() as repeat_db:
                return await _run_single_batch(run_index, repeat_db)

    if max_parallel_repeats <= 1:
        replay_batches: List[_ReplayBatchResult] = []
        for run_index in range(1, total_runs + 1):
            batch = await _run_batch(run_index)
            if batch is None:
                raise ReleaseGateCancelled()
            replay_batches.append(batch)
        return replay_batches

    tasks = [asyncio.create_task(_run_batch(run_index)) for run_index in range(1, total_runs + 1)]
    results = await asyncio.gather(*tasks)
    if any(batch is None for batch in results):
        raise ReleaseGateCancelled()
    return [batch for batch in results if batch is not None]


def _calculate_release_gate_attempts(
    snapshots: List[Snapshot], payload: "ReleaseGateValidateRequest"
) -> int:
    repeat_runs = max(1, int(getattr(payload, "repeat_runs", 0) or 1))
    return len(snapshots) * repeat_runs


def _charge_release_gate_attempts(
    db: Session, current_user: User, project_id: int, attempts: int
) -> None:
    if attempts <= 0:
        return
    SubscriptionService(db).increment_usage(
        user_id=int(current_user.id),
        metric_type="release_gate_attempts",
        amount=int(attempts),
        project_id=project_id,
    )


def _enforce_release_gate_attempt_limit(
    payload: "ReleaseGateValidateRequest",
    db: Session,
    current_user: User,
    project_id: int,
    resolved_inputs: _ResolvedReleaseGateInputs,
) -> int:
    attempts = _calculate_release_gate_attempts(resolved_inputs.snapshots, payload)
    allowed, err_msg = check_release_gate_attempts_limit(
        db,
        current_user.id,
        amount=attempts,
        is_superuser=getattr(current_user, "is_superuser", False),
    )
    if allowed:
        return attempts
    limit_status = get_limit_status(db, current_user.id, "release_gate_attempts")

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "LIMIT_RELEASE_GATE_ATTEMPTS",
            "message": err_msg,
            "details": {
                "plan_type": limit_status.get("plan_type"),
                "metric": limit_status.get("metric"),
                "current": limit_status.get("current"),
                "limit": limit_status.get("limit"),
                "remaining": limit_status.get("remaining"),
                "reset_at": limit_status.get("reset_at"),
                "upgrade_path": "/settings/billing",
                "attempts_requested": attempts,
            },
            "usage_formula": "selected_logs_x_repeats",
            "next_steps": [
                "Reduce selected logs or repeat count for this run.",
                "Upgrade your plan for more Release Gate usage.",
            ],
        },
    )

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
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    snapshots = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id == effective_agent_id,
            Snapshot.created_at >= since,
            Snapshot.is_deleted.is_(False),
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


class ToolContextInject(BaseModel):
    """
    When mode=inject, resolved text is appended to the replay system prompt so runs can
    include docs/code/tool outcomes that were never captured in logs (e.g. redacted at source).
    """

    scope: Literal["per_snapshot", "global"] = Field(
        "per_snapshot",
        description=(
            "global: use global_text for every snapshot. "
            "per_snapshot: use by_snapshot_id[snapshot_id], then optional global_text if missing."
        ),
    )
    global_text: Optional[str] = Field(
        None,
        description="Shared additional system text when scope=global, or fallback when scope=per_snapshot.",
    )
    by_snapshot_id: Optional[Dict[str, str]] = Field(
        None,
        description="Map snapshot id (string) -> additional system text for that log.",
    )


class ToolContextConfig(BaseModel):
    mode: Literal["recorded", "inject"] = Field(
        "recorded",
        description="recorded: use captured request only. inject: append resolved ToolContextInject text to system prompt.",
    )
    inject: Optional[ToolContextInject] = Field(None, description="Used when mode=inject.")


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
    replay_user_api_key_id: Optional[int] = Field(
        None,
        description=(
            "Optional saved project User API key id (Settings > API Keys). "
            "When set in detected/BYOK mode, this key is used for replay instead of the default lookup."
        ),
    )
    new_system_prompt: Optional[str] = Field(None, description="Replay system prompt override")
    replay_temperature: Optional[float] = Field(None, description="Replay request temperature override")
    replay_max_tokens: Optional[int] = Field(None, description="Replay request max_tokens override")
    replay_top_p: Optional[float] = Field(None, description="Replay request top_p override")
    replay_overrides: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Optional configuration-only overrides merged into the replay request body "
            "(e.g. tools, sampling/format knobs). Snapshot content fields such as "
            "messages/user_message/response/trace_id/agent_id/agent_name are ignored."
        ),
    )
    replay_overrides_by_snapshot_id: Optional[Dict[str, Dict[str, Any]]] = Field(
        None,
        description=(
            "Optional per-log request body overrides merged after replay_overrides for that snapshot id "
            "(string keys). Same disallowed keys as replay_overrides. Wins over replay_overrides "
            "on key conflict."
        ),
    )
    tool_context: Optional[ToolContextConfig] = Field(
        None,
        description=(
            "Optional additional system context for replay (e.g. tool/doc/code not present in captured logs). "
            "When mode=inject, resolved text is appended to the system prompt per snapshot."
        ),
    )
    rule_ids: Optional[List[str]] = Field(None, description="Optional specific rule IDs")
    max_snapshots: int = Field(20, ge=1, le=100, description="Max snapshots replayed from trace")
    repeat_runs: int = Field(3, ge=1, le=100, description="Repeat replay N times (1=quick, 10/50/100=stability)")
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


ReleaseGateJobStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]
# Running jobs: workers publish status to a long-lived key; this TTL only bounds poll-cache DB misses.
RELEASE_GATE_JOB_POLL_CACHE_TTL_RUNNING_SEC = 4
RELEASE_GATE_JOB_POLL_CACHE_TTL_TERMINAL_SEC = 10


class ReleaseGateJobProgressOut(BaseModel):
    done: int = 0
    total: Optional[int] = None
    phase: Optional[str] = None


class ReleaseGateJobOut(BaseModel):
    id: str
    status: ReleaseGateJobStatus
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    cancel_requested_at: Optional[str] = None
    progress: ReleaseGateJobProgressOut
    report_id: Optional[str] = None
    error_detail: Optional[Dict[str, Any]] = None
    perf: Optional[Dict[str, Optional[int]]] = None


class ReleaseGateJobCreateResponse(BaseModel):
    job: ReleaseGateJobOut


class ReleaseGateJobGetResponse(BaseModel):
    job: ReleaseGateJobOut
    result: Optional[Dict[str, Any]] = None


class ReleaseGateJobActiveResponse(BaseModel):
    job: Optional[ReleaseGateJobOut] = None
    result: Optional[Dict[str, Any]] = None


def _datetime_delta_ms(start: Optional[datetime], end: Optional[datetime]) -> Optional[int]:
    if start is None or end is None:
        return None
    try:
        return max(0, int((end - start).total_seconds() * 1000))
    except Exception:
        return None


def _job_perf_summary(job: ReleaseGateJob) -> Optional[Dict[str, Optional[int]]]:
    perf = {
        "queue_wait_ms": _datetime_delta_ms(
            getattr(job, "created_at", None),
            getattr(job, "started_at", None),
        ),
        "execution_wall_ms": _datetime_delta_ms(
            getattr(job, "started_at", None),
            getattr(job, "finished_at", None),
        ),
        "total_completion_ms": _datetime_delta_ms(
            getattr(job, "created_at", None),
            getattr(job, "finished_at", None),
        ),
    }
    if all(value is None for value in perf.values()):
        return None
    return perf


def _merge_result_perf_with_job_summary(
    result_json: Dict[str, Any], job: ReleaseGateJob, finished_at: Optional[datetime] = None
) -> Dict[str, Any]:
    return merge_result_perf_with_job_summary(result_json, job, finished_at)


def _job_to_out(job: ReleaseGateJob) -> ReleaseGateJobOut:
    return ReleaseGateJobOut(
        id=str(job.id),
        status=str(job.status),
        created_at=_iso(getattr(job, "created_at", None)),
        started_at=_iso(getattr(job, "started_at", None)),
        finished_at=_iso(getattr(job, "finished_at", None)),
        cancel_requested_at=_iso(getattr(job, "cancel_requested_at", None)),
        progress=ReleaseGateJobProgressOut(
            done=int(getattr(job, "progress_done", 0) or 0),
            total=(int(job.progress_total) if getattr(job, "progress_total", None) is not None else None),
            phase=(str(job.progress_phase) if getattr(job, "progress_phase", None) else None),
        ),
        report_id=str(job.report_id) if getattr(job, "report_id", None) else None,
        error_detail=job.error_detail if isinstance(job.error_detail, dict) else None,
        perf=_job_perf_summary(job),
    )


def _job_to_out_payload(job: ReleaseGateJob) -> Dict[str, Any]:
    return _job_to_out(job).model_dump()


def _release_gate_job_poll_cache_key(project_id: int, job_id: str, include_result: int = 0) -> str:
    return f"project:{project_id}:release_gate:job:{job_id}:include_result:{1 if include_result else 0}"


def _release_gate_job_poll_cache_ttl(status_value: Any) -> int:
    status_text = str(status_value or "").strip().lower()
    if status_text in {"succeeded", "failed", "canceled"}:
        return RELEASE_GATE_JOB_POLL_CACHE_TTL_TERMINAL_SEC
    return RELEASE_GATE_JOB_POLL_CACHE_TTL_RUNNING_SEC


async def _get_release_gate_hot_user_id(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> int:
    return resolve_hot_path_user_id(
        request,
        token,
        db,
        feature_name="release_gate",
        auth_cache_ttl_sec=30,
    )


def _ensure_release_gate_hot_path_access(project_id: int, user_id: int, db: Session) -> None:
    _domain_ensure_release_gate_hot_path_access(
        project_id,
        user_id,
        db,
        access_cache_ttl_sec=15,
    )


def _get_active_release_gate_job(
    db: Session,
    *,
    project_id: int,
    user_id: int,
) -> Optional[ReleaseGateJob]:
    return (
        db.query(ReleaseGateJob)
        .filter(
            ReleaseGateJob.project_id == project_id,
            ReleaseGateJob.user_id == user_id,
            ReleaseGateJob.status.in_(["queued", "running"]),
        )
        .order_by(ReleaseGateJob.created_at.desc())
        .first()
    )


def _get_active_release_gate_job_for_agent(
    db: Session,
    *,
    project_id: int,
    user_id: int,
    agent_id: Optional[str],
) -> Optional[ReleaseGateJob]:
    normalized_agent_id = str(agent_id or "").strip()
    query = (
        db.query(ReleaseGateJob)
        .filter(
            ReleaseGateJob.project_id == project_id,
            ReleaseGateJob.user_id == user_id,
            ReleaseGateJob.status.in_(["queued", "running"]),
        )
        .order_by(ReleaseGateJob.created_at.desc())
    )
    jobs = query.limit(50).all()
    if not normalized_agent_id:
        return jobs[0] if jobs else None
    for job in jobs:
        req = getattr(job, "request_json", None)
        req_obj = req if isinstance(req, dict) else {}
        req_agent_id = str(req_obj.get("agent_id") or "").strip()
        if req_agent_id and req_agent_id == normalized_agent_id:
            return job
    return None


def _sanitize_release_gate_job_request(payload: ReleaseGateValidateRequest) -> Dict[str, Any]:
    data = payload.model_dump()
    # Never persist secrets.
    data.pop("replay_api_key", None)
    return data


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

        # Stage 2 alpha: preserve loop-level tool result evidence as canonical steps.
        loop_events = res.get("tool_loop_events")
        if isinstance(loop_events, list):
            for ev_idx, ev in enumerate(loop_events, start=1):
                if not isinstance(ev, dict):
                    continue
                round_no = ev.get("round")
                try:
                    round_no_int = int(round_no) if round_no is not None else ev_idx
                except Exception:
                    round_no_int = ev_idx
                tool_rows = ev.get("tool_rows")
                if not isinstance(tool_rows, list):
                    continue
                for row_idx, row in enumerate(tool_rows, start=1):
                    if not isinstance(row, dict):
                        continue
                    tool_name = str(row.get("name") or "").strip()
                    if not tool_name:
                        continue
                    step_order = (
                        order
                        + 0.2
                        + float(max(round_no_int, 1)) * 0.01
                        + float(row_idx) * 0.0001
                    )
                    step_result_payload = {
                        "status": str(row.get("status") or "").strip().lower() or "unknown",
                        "arguments_preview": row.get("arguments_preview"),
                        "result_preview": row.get("result_preview"),
                        "round": round_no_int,
                    }
                    steps.append(
                        {
                            **base,
                            "step_order": step_order,
                            "step_type": "tool_result",
                            "tool_name": tool_name,
                            "tool_args": {
                                "status": step_result_payload["status"],
                                "round": round_no_int,
                            },
                            "tool_result": step_result_payload,
                        }
                    )

    return sorted(steps, key=lambda x: x.get("step_order") or 0)


def _baseline_sequence_for_snapshot(snapshot: Snapshot) -> List[str]:
    """Get ordered tool name list from snapshot for behavior diff baseline."""
    raw = getattr(snapshot, "tool_calls_summary", None)
    if isinstance(raw, list):
        return tool_calls_summary_to_sequence(raw)
    return []


def _build_stage1_tool_evidence(
    run_tool_summary: Any,
    replay_result: Optional[Dict[str, Any]] = None,
    max_items: int = 20,
) -> List[Dict[str, Any]]:
    """
    Stage 1 evidence model:
    - detect tool calls from provider response
    - do not execute tools yet
    - expose deterministic evidence rows for UI trust cues
    """
    if not isinstance(run_tool_summary, list):
        run_tool_summary = []

    # Prefer richer loop events when present (Stage 2 alpha+).
    if isinstance(replay_result, dict):
        loop_events = replay_result.get("tool_loop_events")
        if isinstance(loop_events, list):
            rows: List[Dict[str, Any]] = []
            for ev in loop_events:
                if not isinstance(ev, dict):
                    continue
                tool_rows = ev.get("tool_rows")
                if not isinstance(tool_rows, list):
                    continue
                for item in tool_rows:
                    if not isinstance(item, dict):
                        continue
                    name = str(item.get("name") or "").strip()
                    if not name:
                        continue
                    st = str(item.get("status") or "simulated").strip().lower()
                    exec_src = str(item.get("execution_source") or st).strip().lower()
                    tr_src = str(item.get("tool_result_source") or "").strip().lower()
                    if not tr_src:
                        tr_src = "baseline_snapshot" if st == "recorded" else "dry_run"
                    cid = item.get("call_id")
                    mt = item.get("match_tier")
                    rows.append(
                        {
                            "order": len(rows) + 1,
                            "name": name,
                            "status": st,
                            "execution_source": exec_src,
                            "tool_result_source": tr_src,
                            "call_id": str(cid).strip() if cid is not None and str(cid).strip() else None,
                            "match_tier": str(mt).strip().lower() if mt is not None else None,
                            "reason_code": "tool_loop_event",
                            "reason_message": "Derived from tool loop events.",
                            "arguments_preview": _safe_preview_json(
                                item.get("arguments_preview"), max_chars=1500
                            ),
                            "result_preview": _safe_preview_json(
                                item.get("result_preview"), max_chars=1500
                            ),
                        }
                    )
                    if len(rows) >= max_items:
                        break
                if len(rows) >= max_items:
                    break
            if rows:
                return rows

    out: List[Dict[str, Any]] = []
    for idx, item in enumerate(run_tool_summary):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        args_preview = _safe_preview_json(item.get("arguments"), max_chars=1500)
        out.append(
            {
                "order": idx + 1,
                "name": name,
                "status": "simulated",
                "reason_code": "stage1_no_tool_execution_loop",
                "reason_message": "Tool call detected, but execution is not enabled in Stage 1.",
                "arguments_preview": args_preview,
                "result_preview": None,
            }
        )
        if len(out) >= max_items:
            break
    return out


def _build_stage1_tool_execution_summary(tool_evidence: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_calls = len(tool_evidence or [])
    simulated = sum(1 for row in (tool_evidence or []) if str(row.get("status")) == "simulated")
    recorded = sum(
        1
        for row in (tool_evidence or [])
        if str(row.get("status")) == "recorded"
        or str(row.get("execution_source") or "").strip().lower() == "recorded"
    )
    executed = recorded
    skipped = sum(1 for row in (tool_evidence or []) if str(row.get("status")) == "skipped")
    failed = sum(1 for row in (tool_evidence or []) if str(row.get("status")) == "failed")
    tool_results = sum(
        1
        for row in (tool_evidence or [])
        if isinstance(row.get("result_preview"), str) and str(row.get("result_preview") or "").strip()
    )

    if total_calls <= 0:
        return {
            "status": "no_tool_calls",
            "confidence": "medium",
            "detail": "No tool calls detected for this attempt.",
            "counts": {
                "total_calls": 0,
                "executed": 0,
                "simulated": 0,
                "recorded": 0,
                "skipped": 0,
                "failed": 0,
                "tool_results": 0,
            },
            "requires_stage2_loop": False,
        }

    return {
        "status": "calls_detected_no_execution",
        "confidence": "low",
        "detail": "Tool calls were detected but not executed in Stage 1.",
        "counts": {
            "total_calls": total_calls,
            "executed": executed,
            "simulated": simulated,
            "recorded": recorded,
            "skipped": skipped,
            "failed": failed,
            "tool_results": tool_results,
        },
        "requires_stage2_loop": True,
    }


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


def _replay_usage_from_provider_result(res: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize token/credit fields from replay_service batch results."""

    def _ni(v: Any) -> Optional[int]:
        if v is None:
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    in_i = _ni(res.get("input_tokens"))
    out_i = _ni(res.get("output_tokens"))
    cred = _ni(res.get("used_credits"))
    if in_i is None and out_i is None:
        total: Optional[int] = None
    else:
        total = (in_i or 0) + (out_i or 0)
    return {
        "input_tokens": in_i,
        "output_tokens": out_i,
        "tokens_total": total,
        "used_credits": cred,
    }


def _baseline_capture_usage(snapshot: Any) -> Dict[str, Any]:
    """Tokens/cost stored on the original snapshot row (Live View capture), if any."""
    tu = getattr(snapshot, "tokens_used", None)
    cost_raw = getattr(snapshot, "cost", None)
    out: Dict[str, Any] = {
        "tokens_used": int(tu) if tu is not None else None,
        "cost": None,
    }
    if cost_raw is not None:
        try:
            out["cost"] = float(cost_raw)
        except (TypeError, ValueError):
            out["cost"] = None
    return out


def _normalize_provider(value: Any) -> Optional[str]:
    provider = str(value or "").strip().lower()
    if provider in SUPPORTED_REPLAY_PROVIDERS:
        return provider
    return None


def _infer_provider_from_model(model: Any) -> Optional[str]:
    m = str(model or "").strip().lower()
    if not m:
        return None
    # Explicit OpenAI families
    if (
        m.startswith("gpt")
        or m.startswith("o1")
        or m.startswith("o3")
        or m.startswith("o4")
        or m.startswith("text-embedding")
        or m.startswith("openai/")
    ):
        return "openai"
    if "claude" in m or m.startswith("anthropic/"):
        return "anthropic"
    if (
        "gemini" in m
        or "google" in m
        or m.startswith("models/gemini")
        or m.startswith("google/")
    ):
        return "google"
    # Unknown model IDs should not force a provider.
    return None


def _assert_provider_matches_model(replay_provider: Any, model: Any) -> None:
    provider = _normalize_provider(replay_provider)
    inferred = _infer_provider_from_model(model)
    if not provider or not inferred:
        return
    if provider == inferred:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={
            "error_code": "provider_model_mismatch",
            "message": "Selected replay_provider does not match provider inferred from new_model.",
            "replay_provider": provider,
            "inferred_provider": inferred,
            "model_id": str(model or "").strip(),
        },
    )


def _early_platform_hosted_model_check(payload: ReleaseGateValidateRequest, current_user: User) -> None:
    """Fail fast for validate-async when platform mode uses a model not on the hosted allowlist."""
    if str(getattr(payload, "model_source", None) or "") != "platform":
        return
    explicit = _normalize_provider(payload.replay_provider)
    if not explicit and payload.new_model:
        explicit = _infer_provider_from_model(payload.new_model)
    if not explicit or not str(payload.new_model or "").strip():
        return
    if _hosted_platform_policy_bypass(current_user):
        return
    if not _hosted_platform_model_allowed(explicit, payload.new_model):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "HOSTED_MODEL_NOT_ALLOWED",
                "message": (
                    "This model is not available for hosted (platform) runs. "
                    "Pick a hosted quick-pick model or use Custom model ID with your saved API key (BYOK)."
                ),
                "provider": explicit,
                "model_id": str(payload.new_model or "").strip(),
            },
        )


def _resolve_release_gate_inputs(
    project_id: int,
    payload: ReleaseGateValidateRequest,
    db: Session,
) -> _ResolvedReleaseGateInputs:
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
                Snapshot.is_deleted.is_(False),
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
                Snapshot.is_deleted.is_(False),
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
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={
                        "error_code": "dataset_agent_mismatch",
                        "message": "Selected datasets must belong to the currently selected node.",
                        "expected_agent_id": selected_dataset_agent_id,
                        "dataset_ids": mismatched_dataset_ids[:20],
                    },
                )
        elif len(non_empty_dataset_agent_ids) > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
        dedup_snapshot_ids: List[Any] = []
        seen_snapshot_ids = set()
        for sid in snapshot_ids_to_use:
            sid_key = str(sid)
            if sid_key in seen_snapshot_ids:
                continue
            seen_snapshot_ids.add(sid_key)
            dedup_snapshot_ids.append(sid)
        snapshot_ids_to_use = dedup_snapshot_ids

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
                        Snapshot.is_deleted.is_(False),
                    )
                    .first()
                )
                if first_snap:
                    trace_id = first_snap.trace_id

        if not baseline_trace_id and trace_id:
            baseline_trace_id = trace_id

    if not trace_id and not snapshot_ids_to_use and not payload.use_recent_snapshots:
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
                Snapshot.is_deleted.is_(False),
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
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail={
                            "error_code": "dataset_snapshot_agent_mismatch",
                            "message": "Selected datasets include logs from another node.",
                            "expected_agent_id": selected_dataset_agent_id,
                            "snapshot_ids": mismatched_snapshot_ids[:20],
                        },
                    )
            elif len(snapshot_agent_ids) > 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
            .filter(
                Snapshot.project_id == project_id,
                Snapshot.trace_id == trace_id,
                Snapshot.is_deleted.is_(False),
            )
            .order_by(Snapshot.span_order.asc().nullslast(), Snapshot.created_at.asc())
            .limit(payload.max_snapshots)
            .all()
        )
    if not snapshots:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No snapshots found for trace_id={trace_id}",
        )

    return _ResolvedReleaseGateInputs(
        trace_id=trace_id,
        baseline_trace_id=baseline_trace_id,
        snapshots=snapshots,
    )


def _resolve_snapshot_provider(snapshot: Snapshot) -> Optional[str]:
    provider = _normalize_provider(getattr(snapshot, "provider", None))
    if provider:
        return provider
    return _infer_provider_from_model(getattr(snapshot, "model", None))


async def _run_release_gate(
    project_id: int,
    payload: ReleaseGateValidateRequest,
    db: Session,
    current_user: User,
    cancel_check: Optional[Callable[[], bool]] = None,
    progress_hook: Optional[Callable[[int, Optional[int], Optional[str], Optional[Dict[str, Any]]], None]] = None,
    resolved_inputs: Optional[_ResolvedReleaseGateInputs] = None,
) -> Dict[str, Any]:
    resolved = resolved_inputs or _resolve_release_gate_inputs(project_id, payload, db)
    trace_id = resolved.trace_id
    baseline_trace_id = resolved.baseline_trace_id
    snapshots = resolved.snapshots

    provider_context = resolve_release_gate_provider_context(
        project_id=project_id,
        payload=payload,
        db=db,
        current_user=current_user,
        snapshots=snapshots,
        normalize_provider=_normalize_provider,
        infer_provider_from_model=_infer_provider_from_model,
        assert_provider_matches_model=_assert_provider_matches_model,
        hosted_platform_policy_bypass=_hosted_platform_policy_bypass,
        hosted_platform_model_allowed=_hosted_platform_model_allowed,
        should_block_release_gate_custom_model=_should_block_release_gate_custom_model,
        resolve_snapshot_provider=_resolve_snapshot_provider,
    )
    explicit_provider = provider_context.explicit_provider
    replay_user_api_key_override = provider_context.replay_user_api_key_override
    use_platform_model = payload.model_source == "platform"

    rules_query = db.query(BehaviorRule).filter(BehaviorRule.project_id == project_id)
    if payload.rule_ids:
        rules_query = rules_query.filter(BehaviorRule.id.in_(payload.rule_ids))
    else:
        rules_query = rules_query.filter(BehaviorRule.enabled.is_(True))
    rules = rules_query.order_by(BehaviorRule.created_at.asc()).all()
    baseline_steps: List[Dict[str, Any]] = []

    # Load Live View diagnostic config (signals eval) for this agent, if available.
    eval_config_raw: Any = {}
    if payload.agent_id:
        try:
            setting = (
                db.query(AgentDisplaySetting)
                .filter(
                    AgentDisplaySetting.project_id == project_id,
                    AgentDisplaySetting.system_prompt_hash == payload.agent_id,
                )
                .first()
            )
            if setting and isinstance(getattr(setting, "diagnostic_config", None), dict):
                eval_config_raw = _extract_release_gate_eval_config(setting.diagnostic_config or {})
        except Exception:
            eval_config_raw = {}

    try:
        eval_config_version = eval_config_version_hash(eval_config_raw or {})
    except Exception:
        eval_config_version = None
    try:
        config_check_ids = _configured_eval_check_ids(eval_config_raw or {})
    except Exception:
        config_check_ids = []

    # Signals-only config (do not run tool policy twice; policy is validated via BehaviorRules).
    try:
        eval_config_signals = normalize_eval_config(eval_config_raw or {})
        if isinstance(eval_config_signals.get("tool"), dict):
            eval_config_signals["tool"]["enabled"] = False
    except Exception:
        eval_config_signals = {"enabled": True}

    attempts = _calculate_release_gate_attempts(snapshots, payload)
    _charge_release_gate_attempts(db, current_user, project_id, attempts)

    if payload.evaluation_mode == "replay_test":
        normalizer = DataNormalizer()
        snapshot_by_id: Dict[int, Snapshot] = {s.id: s for s in snapshots}
        attempts_by_snapshot: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        all_reasons: List[str] = []
        perf_started = time.monotonic()

        tool_context_payload: Optional[Dict[str, Any]] = (
            payload.tool_context.model_dump(exclude_none=True)
            if payload.tool_context is not None
            else None
        )

        replay_batches = await _execute_release_gate_replay_batches(
            project_id=project_id,
            payload=payload,
            snapshots=snapshots,
            db=db,
            tool_context_payload=tool_context_payload,
            replay_user_api_key_override=replay_user_api_key_override,
            use_platform_model=use_platform_model,
            cancel_check=cancel_check,
            progress_hook=progress_hook,
        )
        perf_attempts: List[Dict[str, Any]] = [
            {
                "run_index": replay_batch.run_index,
                "batch_wall_ms": replay_batch.batch_wall_ms,
                "snapshots": len(replay_batch.replay_results),
                "succeeded": replay_batch.succeeded,
                "failed": replay_batch.failed,
                "avg_snapshot_latency_ms": replay_batch.avg_snapshot_latency_ms,
            }
            for replay_batch in replay_batches
        ]

        for replay_batch in replay_batches:
            run_number = replay_batch.run_index
            replay_results = replay_batch.replay_results

            for res in replay_results:
                snapshot = snapshot_by_id.get(res.get("snapshot_id"))
                if not snapshot:
                    continue
                snapshot_payload = (
                    snapshot.payload
                    if isinstance(getattr(snapshot, "payload", None), dict)
                    else {}
                )
                baseline_input_text = str(
                    getattr(snapshot, "user_message", None)
                    or snapshot_payload.get("prompt")
                    or snapshot_payload.get("input")
                    or snapshot_payload.get("user_message")
                    or ""
                ).strip()
                candidate_extract_path: Optional[str] = None
                candidate_extract_reason: Optional[str] = None
                try:
                    extract_meta = normalizer._extract_response_text_with_meta(res.get("response_data"))
                    if not isinstance(extract_meta, dict):
                        extract_meta = {
                            "text": _safe_preview_json(res.get("response_data"))
                            or "[non-text response received]",
                            "path": "__extract_meta_invalid__",
                            "reason": "extract_meta_invalid",
                        }
                    candidate_response_preview = str(extract_meta.get("text") or "")
                    candidate_extract_path = (
                        str(extract_meta.get("path")).strip() if extract_meta.get("path") else None
                    )
                    candidate_extract_reason = (
                        str(extract_meta.get("reason")).strip() if extract_meta.get("reason") else None
                    )
                except Exception as exc:
                    candidate_response_preview = (
                        _safe_preview_json(res.get("response_data"))
                        or "[non-text response received]"
                    )
                    candidate_extract_path = "__release_gate_runtime__"
                    candidate_extract_reason = "extract_meta_runtime_error"
                    try:
                        logger.warning(
                            "Release Gate extract meta runtime fallback: snapshot_id=%s, error=%s",
                            str(res.get("snapshot_id")),
                            str(exc),
                        )
                    except Exception:
                        pass

                # Small status flag for UI/debugging.
                response_preview_status = "ok"
                try:
                    preview_text = str(candidate_response_preview or "").strip()
                    if not preview_text:
                        response_preview_status = (
                            "tool_calls_only"
                            if str(candidate_extract_reason or "").strip().lower() == "tool_calls_only"
                            else "empty"
                        )
                    elif "tool calls only" in preview_text.lower():
                        response_preview_status = "tool_calls_only"
                except Exception:
                    response_preview_status = "unknown"

                # Capture lightweight response_data key summary for UI debugging.
                response_data_keys: List[str] = []
                try:
                    rd = res.get("response_data")
                    if isinstance(rd, dict):
                        response_data_keys = sorted([str(k) for k in rd.keys()])
                    elif isinstance(rd, str):
                        response_data_keys = ["<text>"]
                    elif rd is None:
                        response_data_keys = []
                    else:
                        response_data_keys = [f"<{type(rd).__name__}>"]
                except Exception:
                    response_data_keys = []

                baseline_response_text = ""
                baseline_response_data_keys: List[str] = []
                baseline_response_preview_status = "unknown"
                baseline_response_capture_reason: Optional[str] = None
                try:
                    raw_baseline_resp = getattr(snapshot, "response", None)
                    if isinstance(raw_baseline_resp, str):
                        baseline_response_text = raw_baseline_resp
                        baseline_response_data_keys = ["<text>"] if raw_baseline_resp.strip() else []
                    elif isinstance(raw_baseline_resp, dict):
                        baseline_response_text = normalizer._extract_response_text(raw_baseline_resp)
                        baseline_response_data_keys = sorted([str(k) for k in raw_baseline_resp.keys()])
                    else:
                        baseline_response_text = str(raw_baseline_resp or "")
                        baseline_response_data_keys = (
                            [f"<{type(raw_baseline_resp).__name__}>"] if raw_baseline_resp is not None else []
                        )
                except Exception:
                    baseline_response_text = ""
                    baseline_response_data_keys = []
                baseline_len = len(baseline_response_text.strip()) if baseline_response_text else None
                baseline_response_preview = str(baseline_response_text or "").strip()[:2000]
                try:
                    if raw_baseline_resp is None:
                        baseline_response_preview_status = "not_captured"
                        baseline_response_capture_reason = "snapshot.response is null"
                    elif isinstance(raw_baseline_resp, str) and not raw_baseline_resp.strip():
                        baseline_response_preview_status = "empty"
                        baseline_response_capture_reason = "snapshot.response is empty string"
                    elif isinstance(raw_baseline_resp, dict) and not str(baseline_response_preview or "").strip():
                        baseline_response_preview_status = "empty"
                        baseline_response_capture_reason = "snapshot.response extracted to empty text"
                    elif str(baseline_response_preview or "").strip():
                        baseline_response_preview_status = "ok"
                    else:
                        baseline_response_preview_status = "unknown"
                except Exception:
                    baseline_response_preview_status = "unknown"

                try:
                    status_code_val = res.get("status_code")
                    status_code_int = int(status_code_val) if isinstance(status_code_val, int) else None
                except Exception:
                    status_code_int = None
                try:
                    latency_val = res.get("latency_ms")
                    latency_int = int(latency_val) if isinstance(latency_val, (int, float)) else None
                except Exception:
                    latency_int = None

                signals_checks: Dict[str, str] = {}
                try:
                    signals_checks = evaluate_one_snapshot_at_save(
                        response_text=candidate_response_preview or "",
                        latency_ms=latency_int,
                        status_code=status_code_int,
                        eval_config=eval_config_signals,
                        baseline_len=baseline_len,
                    )
                except Exception:
                    signals_checks = {}
                try:
                    signals_details = build_release_gate_signal_details(
                        signals_checks=signals_checks or {},
                        eval_config=normalize_eval_config(eval_config_signals or {}),
                        candidate_response_preview=candidate_response_preview or "",
                        latency_ms=latency_int,
                        status_code=status_code_int,
                        baseline_len=baseline_len,
                    )
                except Exception:
                    signals_details = {}
                signals_obj = _build_release_gate_signals_payload(
                    signals_checks=signals_checks or {},
                    signals_details=signals_details or {},
                    eval_config_version=eval_config_version,
                    config_check_ids=config_check_ids,
                )

                run_tool_summary = response_to_canonical_tool_calls_summary(
                    res.get("response_data") or {}, res.get("replay_provider")
                )
                tool_evidence = _build_stage1_tool_evidence(run_tool_summary, replay_result=res)
                tool_execution_summary = _build_stage1_tool_execution_summary(tool_evidence)
                tool_loop_status = str(res.get("tool_loop_status") or "").strip().lower()
                tool_grounding_heuristic = _assess_tool_grounding(
                    tool_evidence=tool_evidence,
                    candidate_response_preview=candidate_response_preview,
                    tool_loop_status=tool_loop_status,
                )
                tool_grounding_semantic: Optional[Dict[str, Any]] = None
                if str(tool_grounding_heuristic.get("status") or "").strip().lower() == "fail":
                    tool_grounding_semantic = await _run_semantic_tool_grounding_judge(
                        tool_evidence=tool_evidence,
                        candidate_response_preview=candidate_response_preview,
                        project_id=project_id,
                        agent_id=getattr(snapshot, "agent_id", None),
                        db=db,
                    )
                tool_grounding = _merge_tool_grounding_with_semantic(
                    tool_grounding_heuristic,
                    tool_grounding_semantic,
                )
                tool_grounding_status = str(tool_grounding.get("status") or "").strip().lower()
                signals_obj["runtime_checks"]["tool_grounding"] = tool_grounding_status
                signals_obj["runtime_details"]["tool_grounding"] = tool_grounding
                baseline_seq = _baseline_sequence_for_snapshot(snapshot)
                candidate_seq = tool_calls_summary_to_sequence(run_tool_summary)
                behavior_diff = compute_behavior_diff(baseline_seq, candidate_seq).to_dict()

                if not res.get("success"):
                    replay_error_msgs = _collect_replay_error_messages([res], limit=1)
                    reasons = replay_error_msgs or ["Replay request failed."]
                    replay_error_code = str(res.get("error_code") or "").strip() or None
                    replay_provider = str(res.get("replay_provider") or "").strip() or None
                    if replay_error_code:
                        ops_alerting.observe_provider_error(
                            project_id=project_id,
                            provider=replay_provider or _resolve_snapshot_provider(snapshot) or "unknown",
                            error_code=replay_error_code,
                            error_summary=str(res.get("error") or "").strip()[:180],
                        )
                    provider_error_preview = _safe_preview_json(res.get("response_data"))
                    provider_error_obj = {
                        "provider": replay_provider,
                        "status_code": res.get("status_code"),
                        "error_code": res.get("error_code"),
                        "error_type": res.get("error_type"),
                        "message": res.get("error"),
                        "response_preview": provider_error_preview,
                        "response_data_keys": response_data_keys,
                    }
                    attempts_by_snapshot[snapshot.id].append(
                        {
                            "run_index": run_number,
                            "trace_id": snapshot.trace_id,
                            "pass": False,
                            "failure_reasons": reasons,
                            "violations": [],
                            "summary": {},
                            "replay": {
                                "attempted": 1,
                                "succeeded": 0,
                                "failed": 1,
                                "avg_latency_ms": None,
                                "failed_snapshot_ids": [snapshot.id],
                                "error_messages": replay_error_msgs,
                                "error_codes": [replay_error_code] if replay_error_code else [],
                                "provider_error": provider_error_obj,
                                "missing_provider_keys": (
                                    [replay_provider]
                                    if replay_error_code == "missing_api_key" and replay_provider
                                    else []
                                ),
                                "tool_loop_status": str(res.get("tool_loop_status") or "").strip() or None,
                                "tool_loop_rounds": (
                                    int(res.get("tool_loop_rounds"))
                                    if isinstance(res.get("tool_loop_rounds"), (int, float))
                                    else 0
                                ),
                                "tool_loop_events": (
                                    res.get("tool_loop_events")
                                    if isinstance(res.get("tool_loop_events"), list)
                                    else []
                                ),
                                **_replay_usage_from_provider_result({}),
                            },
                            "behavior_diff": behavior_diff,
                            "signals": signals_obj,
                            "tool_execution_summary": tool_execution_summary,
                            "tool_evidence": tool_evidence,
                            "tool_replay_status": tool_execution_summary.get("status"),
                            "final_response_confidence_stage1": tool_execution_summary.get(
                                "confidence"
                            ),
                            "baseline_snapshot": {
                                "response_preview": baseline_response_preview,
                                "response_data_keys": baseline_response_data_keys,
                                "response_preview_status": baseline_response_preview_status,
                                "capture_reason": baseline_response_capture_reason,
                                **_baseline_capture_usage(snapshot),
                            },
                            "candidate_snapshot": {
                                "provider": replay_provider,
                                "model": str(res.get("replay_model") or snapshot.model or "").strip()
                                or None,
                                "status_code": res.get("status_code"),
                                "input_text": baseline_input_text,
                                "response_preview": candidate_response_preview
                                or str(res.get("error") or "").strip(),
                                "response_data_keys": response_data_keys,
                                "response_preview_status": response_preview_status,
                                "response_extract_path": candidate_extract_path,
                                "response_extract_reason": candidate_extract_reason,
                                "tool_calls_summary": run_tool_summary,
                                "request_fallback_stage": (
                                    str(res.get("request_fallback_stage") or "").strip() or None
                                ),
                                "request_fallback_attempts": (
                                    res.get("request_fallback_attempts")
                                    if isinstance(res.get("request_fallback_attempts"), list)
                                    else []
                                ),
                            },
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
                    provider_error_preview = _safe_preview_json(res.get("response_data"))
                    attempts_by_snapshot[snapshot.id].append(
                        {
                            "run_index": run_number,
                            "trace_id": snapshot.trace_id,
                            "pass": False,
                            "failure_reasons": [reason],
                            "violations": [],
                            "summary": {},
                            "replay": {
                                "attempted": 1,
                                "succeeded": 0,
                                "failed": 1,
                                "avg_latency_ms": None,
                                "failed_snapshot_ids": [snapshot.id],
                                "error_messages": replay_error_msgs,
                                "error_codes": [],
                                "provider_error": {
                                    "provider": str(res.get("replay_provider") or "").strip() or None,
                                    "status_code": res.get("status_code"),
                                    "error_code": res.get("error_code"),
                                    "error_type": res.get("error_type"),
                                    "message": res.get("error"),
                                    "response_preview": provider_error_preview,
                                    "response_data_keys": response_data_keys,
                                },
                                "missing_provider_keys": [],
                                "tool_loop_status": str(res.get("tool_loop_status") or "").strip() or None,
                                "tool_loop_rounds": (
                                    int(res.get("tool_loop_rounds"))
                                    if isinstance(res.get("tool_loop_rounds"), (int, float))
                                    else 0
                                ),
                                "tool_loop_events": (
                                    res.get("tool_loop_events")
                                    if isinstance(res.get("tool_loop_events"), list)
                                    else []
                                ),
                                **_replay_usage_from_provider_result({}),
                            },
                            "behavior_diff": behavior_diff,
                            "signals": signals_obj,
                            "tool_execution_summary": tool_execution_summary,
                            "tool_evidence": tool_evidence,
                            "tool_replay_status": tool_execution_summary.get("status"),
                            "final_response_confidence_stage1": tool_execution_summary.get(
                                "confidence"
                            ),
                            "baseline_snapshot": {
                                "response_preview": baseline_response_preview,
                                "response_data_keys": baseline_response_data_keys,
                                "response_preview_status": baseline_response_preview_status,
                                "capture_reason": baseline_response_capture_reason,
                                **_baseline_capture_usage(snapshot),
                            },
                            "candidate_snapshot": {
                                "provider": str(res.get("replay_provider") or "").strip() or None,
                                "model": str(res.get("replay_model") or snapshot.model or "").strip()
                                or None,
                                "status_code": res.get("status_code"),
                                "input_text": baseline_input_text,
                                "response_preview": candidate_response_preview or reason,
                                "response_data_keys": response_data_keys,
                                "response_preview_status": response_preview_status,
                                "response_extract_path": candidate_extract_path,
                                "response_extract_reason": candidate_extract_reason,
                                "tool_calls_summary": run_tool_summary,
                                "request_fallback_stage": (
                                    str(res.get("request_fallback_stage") or "").strip() or None
                                ),
                                "request_fallback_attempts": (
                                    res.get("request_fallback_attempts")
                                    if isinstance(res.get("request_fallback_attempts"), list)
                                    else []
                                ),
                            },
                        }
                    )
                    all_reasons.append(reason)
                    continue

                candidate_rules, candidate_policy_resolution = resolve_effective_rules(
                    rules, candidate_steps
                )
                _candidate_status, candidate_summary, candidate_violations = run_behavior_validation(
                    candidate_rules, candidate_steps
                )
                candidate_tool_result_steps = [
                    st for st in candidate_steps if str(st.get("step_type") or "").strip() == "tool_result"
                ]
                candidate_summary["policy_resolution"] = candidate_policy_resolution
                candidate_summary["ruleset_hash"] = _build_ruleset_hash(candidate_rules)
                candidate_summary["tool_result_count"] = len(candidate_tool_result_steps)
                # Keep rule snapshot lightweight for Release Gate jobs.
                # Full rule definitions can be fetched from Behavior APIs when needed.
                candidate_summary["rule_snapshot"] = [
                    {"id": r.id, "revision": _iso(r.updated_at)}
                    for r in candidate_rules
                ]

                failed_signal_ids = signals_obj.get("failed") if isinstance(signals_obj, dict) else []
                if not isinstance(failed_signal_ids, list):
                    failed_signal_ids = []
                policy_failed = len(candidate_violations) > 0
                signals_failed = len(failed_signal_ids) > 0
                run_pass = (not policy_failed) and (not signals_failed)
                reasons: List[str] = []
                if policy_failed:
                    reasons.append(f"{len(candidate_violations)} policy rule(s) failed")
                if signals_failed:
                    reasons.append(f"{len(failed_signal_ids)} signal check(s) failed")
                if reasons:
                    all_reasons.extend(reasons)

                enriched_violations = _append_violation_context(candidate_violations, candidate_steps)
                avg_latency_ms = (
                    float(res.get("latency_ms"))
                    if res.get("latency_ms") is not None
                    else None
                )
                attempts_by_snapshot[snapshot.id].append(
                    {
                        "run_index": run_number,
                        "trace_id": snapshot.trace_id,
                        "pass": run_pass,
                        "failure_reasons": reasons,
                        "violations": enriched_violations,
                        "summary": candidate_summary,
                        "replay": {
                            "attempted": 1,
                            "succeeded": 1,
                            "failed": 0,
                            "avg_latency_ms": avg_latency_ms,
                            "failed_snapshot_ids": [],
                            "error_messages": [],
                            "error_codes": [],
                            "missing_provider_keys": [],
                            "tool_loop_status": str(res.get("tool_loop_status") or "").strip() or None,
                            "tool_loop_rounds": (
                                int(res.get("tool_loop_rounds"))
                                if isinstance(res.get("tool_loop_rounds"), (int, float))
                                else 0
                            ),
                            "tool_loop_events": (
                                res.get("tool_loop_events")
                                if isinstance(res.get("tool_loop_events"), list)
                                else []
                            ),
                            **_replay_usage_from_provider_result(res),
                        },
                        "behavior_diff": behavior_diff,
                        "signals": signals_obj,
                        "tool_execution_summary": tool_execution_summary,
                        "tool_evidence": tool_evidence,
                        "tool_replay_status": tool_execution_summary.get("status"),
                        "final_response_confidence_stage1": tool_execution_summary.get(
                            "confidence"
                        ),
                        "baseline_snapshot": {
                            "response_preview": baseline_response_preview,
                            "response_data_keys": baseline_response_data_keys,
                            "response_preview_status": baseline_response_preview_status,
                            "capture_reason": baseline_response_capture_reason,
                            **_baseline_capture_usage(snapshot),
                        },
                        "candidate_snapshot": {
                            "provider": str(res.get("replay_provider") or "").strip() or None,
                            "model": str(res.get("replay_model") or snapshot.model or "").strip()
                            or None,
                            "status_code": res.get("status_code"),
                            "input_text": baseline_input_text,
                            "response_preview": candidate_response_preview,
                            "response_data_keys": response_data_keys,
                            "response_preview_status": response_preview_status,
                            "response_extract_path": candidate_extract_path,
                            "response_extract_reason": candidate_extract_reason,
                            "tool_calls_summary": run_tool_summary,
                            "request_fallback_stage": (
                                str(res.get("request_fallback_stage") or "").strip() or None
                            ),
                            "request_fallback_attempts": (
                                res.get("request_fallback_attempts")
                                if isinstance(res.get("request_fallback_attempts"), list)
                                else []
                            ),
                            "tool_loop_status": str(res.get("tool_loop_status") or "").strip() or None,
                            "tool_loop_rounds": (
                                int(res.get("tool_loop_rounds"))
                                if isinstance(res.get("tool_loop_rounds"), (int, float))
                                else 0
                            ),
                            "tool_loop_events": (
                                res.get("tool_loop_events")
                                if isinstance(res.get("tool_loop_events"), list)
                                else []
                            ),
                        },
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
            case_result = build_release_gate_case_result(
                snapshot=snapshot,
                attempts=attempts,
                tool_context_payload=tool_context_payload,
                build_captured_customer_material_from_snapshot=_build_captured_customer_material_from_snapshot,
                build_rg_injection_report=_build_rg_injection_report,
                aggregate_tool_flow_from_attempts=_aggregate_tool_flow_from_attempts,
                baseline_capture_usage=_baseline_capture_usage,
            )
            case_result["run_index"] = len(case_results) + 1
            case_results.append(case_result)

        if not case_results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No snapshot data found to run Replay Test.",
            )

        # If cancellation was requested mid-run, do not persist a report.
        if cancel_check and cancel_check():
            raise ReleaseGateCancelled()
        total_wall_ms = int((time.monotonic() - perf_started) * 1000)
        replay_request_meta = _build_replay_request_meta(snapshots, payload)
        finalized = build_release_gate_final_payload(
            case_results=case_results,
            all_reasons=all_reasons,
            payload=payload,
            trace_id=trace_id,
            baseline_trace_id=baseline_trace_id,
            replay_request_meta=replay_request_meta,
            tool_context_payload=tool_context_payload,
            perf_attempts=perf_attempts,
            total_wall_ms=total_wall_ms,
            ratio_band=_ratio_band,
        )
        gate_pass = bool(finalized["gate_pass"])
        primary_case = finalized["primary_case"]
        primary_summary = finalized["primary_summary"]
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
        db.flush()
        report_summary = _build_release_gate_run_record(db, report)
        if report_summary is not None:
            db.add(report_summary)
        db.commit()
        db.refresh(report)
        response_payload = dict(finalized["response_payload"])
        response_payload["report_id"] = report.id
        return response_payload

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
    project = check_project_access(project_id, current_user, db)
    cache_key = f"project:{project_id}:release_gate:agents:v1:limit={int(limit)}"
    if cache_service.enabled:
        cached = cache_service.get(cache_key)
        if isinstance(cached, dict) and isinstance(cached.get("items"), list):
            return cached
    rows = (
        db.query(Snapshot.agent_id, func.max(Snapshot.created_at).label("last_seen"))
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id.isnot(None),
            Snapshot.is_deleted.is_(False),
        )
        .group_by(Snapshot.agent_id)
        .order_by(desc("last_seen"))
        .limit(limit)
        .all()
    )
    snapshot_agent_ids = [r.agent_id for r in rows if r.agent_id]
    visibility = build_agent_visibility_context(
        project_id=project_id,
        db=db,
        seed_agent_ids=snapshot_agent_ids,
        project=project,
    )

    # Start with agents that have recent snapshots
    ordered_agent_ids: List[str] = list(snapshot_agent_ids)
    seen = set(ordered_agent_ids)

    # Then include agents from blueprint (canvas) so nodes without recent logs still appear
    for aid in visibility.blueprint_map.keys():
        if aid not in seen:
            ordered_agent_ids.append(aid)
            seen.add(aid)

    # Then include agents detected by Sentinel (drift) cache
    for node in visibility.sentinel_agents:
        sid = str(node.get("id") or "").strip() if isinstance(node, dict) else ""
        if sid and sid not in seen:
            ordered_agent_ids.append(sid)
            seen.add(sid)

    # Finally include agents that only exist in AgentDisplaySetting (display settings only)
    for aid in visibility.settings_map.keys():
        if aid and aid not in seen:
            ordered_agent_ids.append(aid)
            seen.add(aid)

    items = []
    for aid in ordered_agent_ids:
        if is_agent_hidden(visibility.settings_map, aid):
            continue
        s = visibility.settings_map.get(aid)
        blueprint_node = visibility.blueprint_map.get(aid)
        blueprint_label = (
            blueprint_node.get("data", {}).get("label")
            if isinstance(blueprint_node, dict)
            else None
        )
        display_name = blueprint_label or (s.display_name if s and s.display_name else (aid or "Agent"))
        items.append({"agent_id": aid, "display_name": display_name})
        if len(items) >= limit:
            break
    payload = {"items": items}
    if cache_service.enabled:
        cache_service.set(cache_key, payload, ttl=20)
    return payload


@router.get("/projects/{project_id}/release-gate/core-models")
def get_release_gate_core_models(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return curated core model presets used by Release Gate UI."""
    check_project_access(project_id, current_user, db)
    return {"providers": CORE_REPLAY_MODELS}


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
            Snapshot.is_deleted.is_(False),
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
            Snapshot.is_deleted.is_(False),
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
    check_project_write_access(project_id, current_user, db, action_label="Running Release Gate")
    if payload.use_recent_snapshots and not payload.agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="agent_id is required when use_recent_snapshots is True",
        )
    resolved_inputs = _resolve_release_gate_inputs(project_id, payload, db)
    attempts = _enforce_release_gate_attempt_limit(
        payload, db, current_user, project_id, resolved_inputs
    )
    try:
        result = await _run_release_gate(
            project_id,
            payload,
            db,
            current_user,
            resolved_inputs=resolved_inputs,
        )
        passed = bool((result or {}).get("pass"))
        reason = ""
        if not passed:
            reasons = (result or {}).get("failure_reasons") or []
            if isinstance(reasons, list) and reasons:
                reason = str(reasons[0])
            else:
                reason = str((result or {}).get("summary") or "release gate failed")
        ev_rows, miss_rows = _tool_evidence_stats_from_gate_result(result if isinstance(result, dict) else None)
        if ev_rows > 0:
            logger.info(
                "release_gate_tool_evidence_snapshot project_id=%s evidence_rows=%s missing_rows=%s",
                project_id,
                ev_rows,
                miss_rows,
            )
        ops_alerting.observe_release_gate_tool_missing_surge(
            project_id, evidence_rows=ev_rows, missing_rows=miss_rows
        )
        ops_alerting.observe_release_gate_result(project_id=project_id, success=passed, error_summary=reason)
        return result
    except HTTPException:
        # Client/business errors are expected in some workflows, so no ops alert here.
        raise
    except Exception as exc:
        ops_alerting.observe_release_gate_result(
            project_id=project_id,
            success=False,
            error_summary=f"exception:{type(exc).__name__}",
        )
        raise


@router.post(
    "/projects/{project_id}/release-gate/validate-async",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ReleaseGateJobCreateResponse,
)
async def validate_release_gate_async(
    project_id: int,
    payload: ReleaseGateValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_write_access(project_id, current_user, db, action_label="Running Release Gate")
    if payload.use_recent_snapshots and not payload.agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="agent_id is required when use_recent_snapshots is True",
        )
    _early_platform_hosted_model_check(payload, current_user)

    user_id = int(getattr(current_user, "id"))
    active_job = _get_active_release_gate_job(db, project_id=project_id, user_id=user_id)
    if active_job is not None:
        return ReleaseGateJobCreateResponse(job=_job_to_out(active_job))

    resolved_inputs = _resolve_release_gate_inputs(project_id, payload, db)
    attempts = _enforce_release_gate_attempt_limit(
        payload, db, current_user, project_id, resolved_inputs
    )

    job = ReleaseGateJob(
        project_id=project_id,
        user_id=user_id,
        status="queued",
        progress_done=0,
        progress_total=int(payload.repeat_runs or 0) or None,
        progress_phase="replay",
        request_json=_sanitize_release_gate_job_request(payload),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    publish_release_gate_job_updated(project_id, str(job.id), _job_to_out_payload(job))
    return ReleaseGateJobCreateResponse(job=_job_to_out(job))


@router.get(
    "/projects/{project_id}/release-gate/jobs/{job_id}",
    response_model=ReleaseGateJobGetResponse,
)
async def get_release_gate_job(
    project_id: int,
    job_id: str,
    include_result: int = Query(0, ge=0, le=1),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(_get_release_gate_hot_user_id),
):
    _ensure_release_gate_hot_path_access(project_id, current_user_id, db)
    should_cache = include_result == 0 and cache_service.enabled
    if should_cache:
        cached_status = cache_service.get(release_gate_job_status_cache_key(project_id, job_id))
        if isinstance(cached_status, dict) and isinstance(cached_status.get("id"), str):
            return ReleaseGateJobGetResponse(job=ReleaseGateJobOut(**cached_status), result=None)
    cache_key = _release_gate_job_poll_cache_key(project_id, job_id, include_result)
    if should_cache:
        cached = cache_service.get(cache_key)
        if isinstance(cached, dict) and isinstance(cached.get("job"), dict):
            return ReleaseGateJobGetResponse(**cached)
    job = (
        db.query(ReleaseGateJob)
        .filter(ReleaseGateJob.project_id == project_id, ReleaseGateJob.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release Gate job not found")
    payload = ReleaseGateJobGetResponse(
        job=_job_to_out(job),
        result=job.result_json if include_result and isinstance(job.result_json, dict) else None,
    )
    if should_cache:
        cache_service.set(
            cache_key,
            payload.model_dump(),
            ttl=_release_gate_job_poll_cache_ttl(getattr(job, "status", None)),
        )
    return payload


@router.get(
    "/projects/{project_id}/release-gate/active-job",
    response_model=ReleaseGateJobActiveResponse,
)
async def get_active_release_gate_job(
    project_id: int,
    agent_id: Optional[str] = Query(None, description="Optional agent id for scoped resume."),
    include_result: int = Query(0, ge=0, le=1),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(_get_release_gate_hot_user_id),
):
    _ensure_release_gate_hot_path_access(project_id, current_user_id, db)
    job = _get_active_release_gate_job_for_agent(
        db,
        project_id=project_id,
        user_id=int(current_user_id),
        agent_id=agent_id,
    )
    if not job:
        return ReleaseGateJobActiveResponse(job=None, result=None)
    payload = ReleaseGateJobActiveResponse(
        job=_job_to_out(job),
        result=job.result_json if include_result and isinstance(job.result_json, dict) else None,
    )
    return payload


@router.get("/projects/{project_id}/release-gate/jobs/{job_id}/stream")
async def stream_release_gate_job(
    project_id: int,
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(_get_release_gate_hot_user_id),
):
    _ensure_release_gate_hot_path_access(project_id, current_user_id, db)
    cached_status = cache_service.get(release_gate_job_status_cache_key(project_id, job_id)) if cache_service.enabled else None
    if isinstance(cached_status, dict) and isinstance(cached_status.get("id"), str):
        initial_job_payload = cached_status
    else:
        job = (
            db.query(ReleaseGateJob)
            .filter(ReleaseGateJob.project_id == project_id, ReleaseGateJob.id == job_id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release Gate job not found")
        initial_job_payload = _job_to_out_payload(job)

    MAX_SSE_PER_USER = 5
    MAX_SSE_PER_JOB = 200
    PRESENCE_TTL_SEC = 120
    RETRY_AFTER_SEC = 30

    conn_id = str(uuid.uuid4())
    user_id = str(current_user_id)

    def _zset_key_job(pid: int, jid: str) -> str:
        return f"sse:release_gate:project:{int(pid)}:job:{str(jid)}"

    def _zset_key_user(uid: str) -> str:
        return f"sse:release_gate:user:{uid}"

    def _reject(detail: str, scope: str) -> None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "SSE_LIMIT_EXCEEDED",
                "message": detail,
                "details": {
                    "scope": scope,
                    "project_id": int(project_id),
                    "job_id": str(job_id),
                    "retry_after_sec": RETRY_AFTER_SEC,
                },
            },
            headers={"Retry-After": str(RETRY_AFTER_SEC)},
        )

    job_zkey = _zset_key_job(project_id, job_id)
    user_zkey = _zset_key_user(user_id)
    if cache_service.enabled and user_id:
        try:
            now_ts = time.time()
            pipe = cache_service.redis_client.pipeline()
            pipe.zremrangebyscore(job_zkey, "-inf", now_ts)
            pipe.zremrangebyscore(user_zkey, "-inf", now_ts)
            pipe.zcard(job_zkey)
            pipe.zcard(user_zkey)
            result = pipe.execute()
            job_count = int(result[-2] or 0)
            user_count = int(result[-1] or 0)
            if user_count >= MAX_SSE_PER_USER:
                _reject(f"Too many Release Gate streams for this user (max={MAX_SSE_PER_USER}).", "user")
            if job_count >= MAX_SSE_PER_JOB:
                _reject(f"Too many Release Gate streams for this job (max={MAX_SSE_PER_JOB}).", "job")
            expire_at = now_ts + PRESENCE_TTL_SEC
            pipe = cache_service.redis_client.pipeline()
            pipe.zadd(job_zkey, {conn_id: expire_at})
            pipe.zadd(user_zkey, {conn_id: expire_at})
            pipe.expire(job_zkey, PRESENCE_TTL_SEC * 2)
            pipe.expire(user_zkey, PRESENCE_TTL_SEC * 2)
            pipe.execute()
        except HTTPException:
            raise
        except Exception:
            pass

    initial_payload = json.dumps(
        {
            "type": "job_updated",
            "project_id": int(project_id),
            "job_id": str(job_id),
            "job": initial_job_payload,
        }
    )

    async def event_gen():
        heartbeat_sec = 5
        last_heartbeat = asyncio.get_event_loop().time()
        realtime_stream_connections_opened_total.labels(surface="release_gate").inc()
        realtime_stream_connections_active.labels(surface="release_gate").inc()
        stop_flag = threading.Event()
        pubsub = None
        channel = release_gate_job_events_channel(project_id, job_id)

        try:
            if not cache_service.enabled:
                yield b"event: connected\ndata: {}\n\n"
                yield f"event: job_updated\ndata: {initial_payload}\n\n".encode("utf-8")
                while not await request.is_disconnected():
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat >= heartbeat_sec:
                        last_heartbeat = now
                        yield b": heartbeat\n\n"
                    await asyncio.sleep(1)
                return

            pubsub = cache_service.redis_client.pubsub(ignore_subscribe_messages=True)
            pubsub.subscribe(channel)

            queue: asyncio.Queue[str] = asyncio.Queue(maxsize=200)

            def _worker():
                try:
                    for msg in pubsub.listen():
                        if stop_flag.is_set():
                            break
                        if not msg or msg.get("type") != "message":
                            continue
                        data = msg.get("data")
                        if not data:
                            continue
                        try:
                            queue.put_nowait(str(data))
                        except Exception:
                            pass
                except Exception:
                    pass

            t = threading.Thread(target=_worker, daemon=True)
            t.start()

            try:
                yield b"event: connected\ndata: {}\n\n"
                yield f"event: job_updated\ndata: {initial_payload}\n\n".encode("utf-8")

                while not await request.is_disconnected():
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat >= heartbeat_sec:
                        last_heartbeat = now
                        yield b": heartbeat\n\n"
                        if cache_service.enabled and user_id:
                            try:
                                now_ts = time.time()
                                expire_at = now_ts + PRESENCE_TTL_SEC
                                pipe = cache_service.redis_client.pipeline()
                                pipe.zadd(job_zkey, {conn_id: expire_at}, xx=True)
                                pipe.zadd(user_zkey, {conn_id: expire_at}, xx=True)
                                pipe.expire(job_zkey, PRESENCE_TTL_SEC * 2)
                                pipe.expire(user_zkey, PRESENCE_TTL_SEC * 2)
                                pipe.execute()
                            except Exception:
                                pass

                    try:
                        raw = await asyncio.wait_for(queue.get(), timeout=1.0)
                    except asyncio.TimeoutError:
                        continue

                    yield f"event: job_updated\ndata: {raw}\n\n".encode("utf-8")
            finally:
                stop_flag.set()
                if cache_service.enabled and user_id:
                    try:
                        pipe = cache_service.redis_client.pipeline()
                        pipe.zrem(job_zkey, conn_id)
                        pipe.zrem(user_zkey, conn_id)
                        pipe.execute()
                    except Exception:
                        pass
                if pubsub is not None:
                    try:
                        pubsub.unsubscribe(channel)
                        pubsub.close()
                    except Exception:
                        pass
        finally:
            stop_flag.set()
            realtime_stream_connections_active.labels(surface="release_gate").dec()
            if cache_service.enabled and user_id:
                try:
                    pipe = cache_service.redis_client.pipeline()
                    pipe.zrem(job_zkey, conn_id)
                    pipe.zrem(user_zkey, conn_id)
                    pipe.execute()
                except Exception:
                    pass

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/projects/{project_id}/release-gate/jobs/{job_id}/cancel",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ReleaseGateJobCreateResponse,
)
async def cancel_release_gate_job(
    project_id: int,
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_write_access(project_id, current_user, db, action_label="Canceling Release Gate")
    job = (
        db.query(ReleaseGateJob)
        .filter(ReleaseGateJob.project_id == project_id, ReleaseGateJob.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release Gate job not found")
    current_status = str(getattr(job, "status", "") or "").lower()
    if current_status not in {"succeeded", "failed", "canceled"}:
        now = datetime.now(timezone.utc)
        if getattr(job, "cancel_requested_at", None) is None:
            job.cancel_requested_at = now
        # If the job has not started yet, we can finalize cancel immediately.
        if current_status == "queued":
            job.status = "canceled"
            job.finished_at = now
            job.progress_phase = "canceled"
        else:
            # For running jobs, keep status as running until the worker acknowledges,
            # but expose cancel_requested_at so UI can show "Canceling…".
            job.progress_phase = "cancel_requested"
        db.add(job)
        db.commit()
        db.refresh(job)
        publish_release_gate_job_updated(project_id, job_id, _job_to_out_payload(job))
    return ReleaseGateJobCreateResponse(job=_job_to_out(job))


@router.post("/projects/{project_id}/release-gate/webhook")
async def release_gate_webhook(
    project_id: int,
    payload: ReleaseGateValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_from_api_key),
):
    check_project_access(project_id, current_user, db)
    resolved_inputs = _resolve_release_gate_inputs(project_id, payload, db)
    attempts = _enforce_release_gate_attempt_limit(
        payload, db, current_user, project_id, resolved_inputs
    )
    try:
        result = await _run_release_gate(
            project_id,
            payload,
            db,
            current_user,
            resolved_inputs=resolved_inputs,
        )
        passed = bool((result or {}).get("pass"))
        reason = ""
        if not passed:
            reasons = (result or {}).get("failure_reasons") or []
            if isinstance(reasons, list) and reasons:
                reason = str(reasons[0])
            else:
                reason = str((result or {}).get("summary") or "release gate failed")
        ev_rows, miss_rows = _tool_evidence_stats_from_gate_result(result if isinstance(result, dict) else None)
        if ev_rows > 0:
            logger.info(
                "release_gate_tool_evidence_snapshot project_id=%s evidence_rows=%s missing_rows=%s",
                project_id,
                ev_rows,
                miss_rows,
            )
        ops_alerting.observe_release_gate_tool_missing_surge(
            project_id, evidence_rows=ev_rows, missing_rows=miss_rows
        )
        ops_alerting.observe_release_gate_result(project_id=project_id, success=passed, error_summary=reason)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        ops_alerting.observe_release_gate_result(
            project_id=project_id,
            success=False,
            error_summary=f"exception:{type(exc).__name__}",
        )
        raise


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
            .filter(
                Snapshot.project_id == project_id,
                Snapshot.trace_id == trace_id,
                Snapshot.is_deleted.is_(False),
            )
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
                Snapshot.is_deleted.is_(False),
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


def _coerce_optional_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _release_gate_meta(summary_json: Any) -> Dict[str, Any]:
    if not isinstance(summary_json, dict):
        return {}
    gate_meta = summary_json.get("release_gate")
    return gate_meta if isinstance(gate_meta, dict) else {}


def _release_gate_history_status(value: Any, *, fallback_pass: bool = False) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"pass", "fail", "flaky"}:
        return normalized
    return "pass" if fallback_pass else "fail"


def _snapshot_history_input_preview(snapshot: Optional[Snapshot]) -> Optional[str]:
    if snapshot is None:
        return None
    candidates: List[Any] = [
        getattr(snapshot, "user_message", None),
    ]
    payload = getattr(snapshot, "payload", None)
    if isinstance(payload, dict):
        candidates.extend(
            [
                payload.get("user_message"),
                payload.get("input"),
                payload.get("prompt"),
            ]
        )
        messages = payload.get("messages")
        if isinstance(messages, list):
            for msg in messages:
                if not isinstance(msg, dict):
                    continue
                role = str(msg.get("role") or "").strip().lower()
                if role != "user":
                    continue
                content = msg.get("content")
                if isinstance(content, str) and content.strip():
                    candidates.append(content)
                    break
                if isinstance(content, list):
                    parts: List[str] = []
                    for part in content:
                        if not isinstance(part, dict):
                            continue
                        text = part.get("text")
                        if isinstance(text, str) and text.strip():
                            parts.append(text.strip())
                    if parts:
                        candidates.append("\n".join(parts))
                        break
    for candidate in candidates:
        text = str(candidate or "").strip()
        if text:
            return _preview_text_snippet(text, 140)
    return None


def _build_release_gate_history_rows(
    report: BehaviorReport,
    gate_meta: Dict[str, Any],
    resolved_agent_id: Optional[str],
) -> List[Dict[str, Any]]:
    repeat_runs = _coerce_optional_int(gate_meta.get("repeat_runs"))
    session_total_inputs = _coerce_optional_int(gate_meta.get("total_inputs"))
    session_status = _release_gate_history_status(report.status)
    mode = str(gate_meta.get("mode") or "replay_test")
    thresholds = gate_meta.get("thresholds")
    created_at_iso = _iso(report.created_at)
    case_results = gate_meta.get("case_results")
    if not isinstance(case_results, list) or not case_results:
        total_attempts = _coerce_optional_int(gate_meta.get("total_attempts"))
        passed_attempts = _coerce_optional_int(gate_meta.get("passed_attempts"))
        failed_attempts = (
            max(total_attempts - passed_attempts, 0)
            if total_attempts is not None and passed_attempts is not None
            else None
        )
        return [
            {
                "id": f"{report.id}:0",
                "report_id": report.id,
                "case_index": 0,
                "input_index": 1,
                "input_label": "Input 1",
                "input_preview": None,
                "status": session_status,
                "trace_id": report.trace_id,
                "baseline_trace_id": report.baseline_run_ref,
                "agent_id": resolved_agent_id,
                "created_at": created_at_iso,
                "session_created_at": created_at_iso,
                "session_status": session_status,
                "mode": mode,
                "repeat_runs": repeat_runs,
                "session_repeat_runs": repeat_runs,
                "total_inputs": session_total_inputs,
                "session_total_inputs": session_total_inputs,
                "passed_attempts": passed_attempts,
                "failed_attempts": failed_attempts,
                "total_attempts": total_attempts,
                "snapshot_id": None,
                "thresholds": thresholds,
            }
        ]

    rows: List[Dict[str, Any]] = []
    computed_total_inputs = session_total_inputs or len(case_results)
    for case_index, case_result in enumerate(case_results):
        if not isinstance(case_result, dict):
            continue
        replay_meta = case_result.get("replay")
        if not isinstance(replay_meta, dict):
            replay_meta = {}
        case_summary = case_result.get("summary")
        if not isinstance(case_summary, dict):
            case_summary = {}
        case_status = _release_gate_history_status(
            case_result.get("case_status"),
            fallback_pass=bool(case_result.get("pass")),
        )
        attempts = case_result.get("attempts")
        attempts_list = attempts if isinstance(attempts, list) else []
        total_attempts = (
            len(attempts_list)
            or _coerce_optional_int(replay_meta.get("attempted"))
            or repeat_runs
        )
        if attempts_list:
            passed_attempts = sum(1 for attempt in attempts_list if bool((attempt or {}).get("pass")))
        else:
            pass_ratio = case_summary.get("pass_ratio")
            if total_attempts is not None and pass_ratio is not None:
                try:
                    passed_attempts = max(
                        0,
                        min(total_attempts, int(round(float(pass_ratio) * total_attempts))),
                    )
                except (TypeError, ValueError):
                    passed_attempts = total_attempts if case_status == "pass" else 0
            else:
                passed_attempts = total_attempts if case_status == "pass" else 0
        failed_attempts = (
            max(total_attempts - passed_attempts, 0)
            if total_attempts is not None and passed_attempts is not None
            else None
        )
        input_index = _coerce_optional_int(case_result.get("run_index")) or (case_index + 1)
        rows.append(
            {
                "id": f"{report.id}:{case_index}",
                "report_id": report.id,
                "case_index": case_index,
                "input_index": input_index,
                "input_label": f"Input {input_index}",
                "input_preview": None,
                "status": case_status,
                "trace_id": case_result.get("trace_id") or report.trace_id,
                "baseline_trace_id": report.baseline_run_ref,
                "agent_id": resolved_agent_id,
                "created_at": created_at_iso,
                "session_created_at": created_at_iso,
                "session_status": session_status,
                "mode": mode,
                "repeat_runs": repeat_runs,
                "session_repeat_runs": repeat_runs,
                "total_inputs": computed_total_inputs,
                "session_total_inputs": computed_total_inputs,
                "passed_attempts": passed_attempts,
                "failed_attempts": failed_attempts,
                "total_attempts": total_attempts,
                "snapshot_id": case_result.get("snapshot_id"),
                "thresholds": thresholds,
            }
        )
    return rows


def _build_release_gate_history_session_result(
    report: BehaviorReport, gate_meta: Dict[str, Any]
) -> Dict[str, Any]:
    return _history_build_release_gate_history_session_result(
        report,
        gate_meta,
        release_gate_history_status=_release_gate_history_status,
        coerce_optional_int=_coerce_optional_int,
    )


def _resolve_release_gate_run_agent_id(db: Session, report: BehaviorReport) -> Optional[str]:
    return _history_resolve_release_gate_run_agent_id(db, report)


def _build_release_gate_run_record(db: Session, report: BehaviorReport) -> Optional[ReleaseGateRun]:
    return _history_build_release_gate_run_record(
        db,
        report,
        release_gate_meta=_release_gate_meta,
        coerce_optional_int=_coerce_optional_int,
    )


def _backfill_release_gate_run_records(
    db: Session,
    *,
    project_id: int,
    cutoff: datetime,
    status_filter: Optional[str] = None,
    trace_id: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
    agent_id: Optional[str] = None,
) -> None:
    query = (
        db.query(BehaviorReport)
        .outerjoin(ReleaseGateRun, ReleaseGateRun.report_id == BehaviorReport.id)
        .filter(
            BehaviorReport.project_id == project_id,
            BehaviorReport.trace_id.isnot(None),
            BehaviorReport.created_at >= cutoff,
            ReleaseGateRun.report_id.is_(None),
            cast(BehaviorReport.summary_json, String).contains('"release_gate"'),
        )
    )
    if status_filter in {"pass", "fail"}:
        query = query.filter(BehaviorReport.status == status_filter)
    if trace_id:
        query = query.filter(BehaviorReport.trace_id == trace_id)
    if created_from:
        query = query.filter(BehaviorReport.created_at >= created_from)
    if created_to:
        query = query.filter(BehaviorReport.created_at <= created_to)
    created_rows = 0
    for report in query.all():
        record = _build_release_gate_run_record(db, report)
        if record is None:
            continue
        db.add(record)
        created_rows += 1
    if created_rows:
        db.commit()


@router.get("/projects/{project_id}/release-gate/history")
async def list_release_gate_history(
    project_id: int,
    status_filter: Optional[str] = Query(None, alias="status", description="pass | fail"),
    agent_id: Optional[str] = Query(None),
    trace_id: Optional[str] = Query(None),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_access(project_id, current_user, db)

    lifecycle = DataLifecycleService(db)
    summary = lifecycle.get_data_retention_summary(project_id)
    if "error" in summary:
        retention_days = 7
    else:
        retention_days = summary.get("retention_days", 7)
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    if created_from and created_from.tzinfo is None:
        created_from = created_from.replace(tzinfo=timezone.utc)
    if created_to and created_to.tzinfo is None:
        created_to = created_to.replace(tzinfo=timezone.utc)

    normalized_agent_id = (agent_id or "").strip() or None
    query = (
        db.query(BehaviorReport)
        .filter(
            BehaviorReport.project_id == project_id,
            BehaviorReport.trace_id.isnot(None),
            BehaviorReport.created_at >= cutoff,
            cast(BehaviorReport.summary_json, String).contains('"release_gate"'),
        )
        .order_by(BehaviorReport.created_at.desc())
    )
    if created_from:
        query = query.filter(BehaviorReport.created_at >= created_from)
    if created_to:
        query = query.filter(BehaviorReport.created_at <= created_to)

    matched_rows: List[Dict[str, Any]] = []
    for report in query.all():
        gate_meta = _release_gate_meta(report.summary_json)
        if not gate_meta:
            continue
        resolved_agent_id = _resolve_release_gate_run_agent_id(db, report)
        if normalized_agent_id and resolved_agent_id != normalized_agent_id:
            continue
        history_rows = _build_release_gate_history_rows(report, gate_meta, resolved_agent_id)
        session_result = _build_release_gate_history_session_result(report, gate_meta)
        for row in history_rows:
            row_status = str(row.get("status") or "").strip().lower()
            if status_filter == "pass" and row_status != "pass":
                continue
            if status_filter == "fail" and row_status not in {"fail", "flaky"}:
                continue
            row_trace_id = str(row.get("trace_id") or "").strip()
            if trace_id and row_trace_id != trace_id:
                continue
            row["session_result"] = session_result
            matched_rows.append(row)

    total = len(matched_rows)
    page_rows = matched_rows[offset : offset + limit]
    snapshot_ids = {
        int(snapshot_id)
        for snapshot_id in (row.get("snapshot_id") for row in page_rows)
        if snapshot_id is not None and str(snapshot_id).strip().isdigit()
    }
    snapshots_by_id: Dict[int, Snapshot] = {}
    if snapshot_ids:
        snapshots_by_id = {
            snapshot.id: snapshot
            for snapshot in db.query(Snapshot)
            .filter(Snapshot.id.in_(snapshot_ids), Snapshot.is_deleted.is_(False))
            .all()
        }
    items: List[Dict[str, Any]] = []
    for row in page_rows:
        snapshot_id = row.get("snapshot_id")
        snapshot: Optional[Snapshot] = None
        if snapshot_id is not None:
            try:
                snapshot = snapshots_by_id.get(int(snapshot_id))
            except (TypeError, ValueError):
                snapshot = None
        input_preview = _snapshot_history_input_preview(snapshot)
        items.append(
            {
                "id": row["id"],
                "report_id": row["report_id"],
                "case_index": row["case_index"],
                "input_index": row["input_index"],
                "input_label": row["input_label"],
                "input_preview": input_preview,
                "status": row["status"],
                "trace_id": row["trace_id"],
                "baseline_trace_id": row["baseline_trace_id"],
                "agent_id": row["agent_id"],
                "created_at": row["created_at"],
                "session_created_at": row["session_created_at"],
                "session_status": row["session_status"],
                "mode": row["mode"],
                "repeat_runs": row["repeat_runs"],
                "session_repeat_runs": row["session_repeat_runs"],
                "total_inputs": row["total_inputs"],
                "session_total_inputs": row["session_total_inputs"],
                "passed_attempts": row["passed_attempts"],
                "failed_attempts": row["failed_attempts"],
                "total_attempts": row["total_attempts"],
                "snapshot_id": row["snapshot_id"],
                "thresholds": row["thresholds"],
                "session_result": row.get("session_result"),
            }
        )

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "retention_days": retention_days,
    }


@router.delete("/projects/{project_id}/release-gate/history/{report_id}")
async def delete_release_gate_history(
    project_id: int,
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_project_write_access(project_id, current_user, db)
    lifecycle = DataLifecycleService(db)
    return lifecycle.delete_release_gate_history_session(project_id, report_id)

