from __future__ import annotations

import hashlib
import json
import re
from statistics import median
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.snapshot import Snapshot
from app.models.behavior_rule import BehaviorRule
from app.core.canonical import response_to_canonical_steps
from app.services.behavior_rules_service import (
    resolve_effective_rules,
    run_behavior_validation,
)


def _clamp_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = default
    return max(minimum, min(maximum, n))


def _clamp_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        n = default
    return max(minimum, min(maximum, n))


def _parse_csv(csv_text: Any) -> List[str]:
    if not isinstance(csv_text, str):
        return []
    return [x.strip() for x in csv_text.split(",") if x.strip()]


def _looks_like_json(text: str) -> bool:
    t = text.strip()
    return (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]"))


def _detect_refusal(text: str) -> bool:
    t = text.lower()
    patterns = [
        "i cannot",
        "i can't",
        "unable to",
        "as an ai",
        "sorry, but i",
        "apologize",
    ]
    return any(p in t for p in patterns)


def _max_line_repeat_count(text: str) -> int:
    lines = [line.strip() for line in text.split("\n")]
    lines = [line for line in lines if len(line) >= 4]
    if not lines:
        return 0
    counts: Dict[str, int] = {}
    max_count = 1
    for line in lines:
        next_count = counts.get(line, 0) + 1
        counts[line] = next_count
        if next_count > max_count:
            max_count = next_count
    return max_count


def _detect_leakage_indicators(text: str) -> bool:
    email = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
    phone = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,3}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}\b")
    openai_key = re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")
    aws_key = re.compile(r"\bAKIA[0-9A-Z]{16}\b")
    return bool(email.search(text) or phone.search(text) or openai_key.search(text) or aws_key.search(text))


def normalize_eval_config(raw_eval: Any) -> Dict[str, Any]:
    cfg = raw_eval if isinstance(raw_eval, dict) else {}
    # Backward/forward compatibility:
    # frontend currently stores tool policy as `tool_use_policy`,
    # while runtime checks use the normalized key `tool`.
    tool_cfg = cfg.get("tool")
    if not isinstance(tool_cfg, dict):
        tool_cfg = cfg.get("tool_use_policy")
    if not isinstance(tool_cfg, dict):
        tool_cfg = {}
    # NOTE: MVP contract uses pass/fail/not_applicable.
    # Each check should have a single "fail threshold" knob where applicable.
    # Backward compatibility: older configs may still contain warn/crit fields; we map them.
    latency_src = cfg.get("latency") if isinstance(cfg.get("latency"), dict) else {}
    status_src = cfg.get("status_code") if isinstance(cfg.get("status_code"), dict) else {}
    length_src = cfg.get("length") if isinstance(cfg.get("length"), dict) else {}
    repetition_src = cfg.get("repetition") if isinstance(cfg.get("repetition"), dict) else {}

    latency_fail_ms = (
        (latency_src.get("fail_ms") if isinstance(latency_src, dict) else None)
        if isinstance(latency_src, dict)
        else None
    )
    if latency_fail_ms is None:
        # Prefer legacy crit_ms when present, else warn_ms, else default.
        legacy = latency_src.get("crit_ms") if isinstance(latency_src, dict) else None
        if legacy is None:
            legacy = latency_src.get("warn_ms") if isinstance(latency_src, dict) else None
        latency_fail_ms = legacy

    status_fail_from = status_src.get("fail_from") if isinstance(status_src, dict) else None
    if status_fail_from is None:
        # Prefer legacy crit_from when present, else warn_from, else default.
        legacy = status_src.get("crit_from") if isinstance(status_src, dict) else None
        if legacy is None:
            legacy = status_src.get("warn_from") if isinstance(status_src, dict) else None
        status_fail_from = legacy

    length_fail_ratio = length_src.get("fail_ratio") if isinstance(length_src, dict) else None
    if length_fail_ratio is None:
        legacy = length_src.get("crit_ratio") if isinstance(length_src, dict) else None
        if legacy is None:
            legacy = length_src.get("warn_ratio") if isinstance(length_src, dict) else None
        length_fail_ratio = legacy

    repetition_fail_repeats = repetition_src.get("fail_line_repeats") if isinstance(repetition_src, dict) else None
    if repetition_fail_repeats is None:
        legacy = repetition_src.get("crit_line_repeats") if isinstance(repetition_src, dict) else None
        if legacy is None:
            legacy = repetition_src.get("warn_line_repeats") if isinstance(repetition_src, dict) else None
        repetition_fail_repeats = legacy

    normalized = {
        "enabled": bool(cfg.get("enabled", True)),
        "window": {"limit": _clamp_int((cfg.get("window") or {}).get("limit"), 50, 10, 200)},
        "empty": {
            "enabled": bool((cfg.get("empty") or {}).get("enabled", True)),
            "min_chars": _clamp_int((cfg.get("empty") or {}).get("min_chars"), 16, 1, 10000),
        },
        "latency": {
            "enabled": bool((cfg.get("latency") or {}).get("enabled", True)),
            "fail_ms": _clamp_int(latency_fail_ms, 5000, 100, 180000),
        },
        "status_code": {
            "enabled": bool((cfg.get("status_code") or {}).get("enabled", True)),
            "fail_from": _clamp_int(status_fail_from, 500, 100, 599),
        },
        "json": {
<<<<<<< HEAD
            "enabled": bool((cfg.get("json") or {}).get("enabled", True)),
            "mode": (cfg.get("json") or {}).get("mode") or "if_json",
        },
        "refusal": {"enabled": bool((cfg.get("refusal") or {}).get("enabled", True))},
        "length": {
            "enabled": bool((cfg.get("length") or {}).get("enabled", True)),
            "fail_ratio": _clamp_float(length_fail_ratio, 0.75, 0.0, 3.0),
        },
        "repetition": {
            "enabled": bool((cfg.get("repetition") or {}).get("enabled", True)),
=======
            "enabled": bool((cfg.get("json") or {}).get("enabled", False)),
            "mode": (cfg.get("json") or {}).get("mode") or "if_json",
        },
        "refusal": {"enabled": bool((cfg.get("refusal") or {}).get("enabled", False))},
        "length": {
            "enabled": bool((cfg.get("length") or {}).get("enabled", False)),
            "fail_ratio": _clamp_float(length_fail_ratio, 0.75, 0.0, 3.0),
        },
        "repetition": {
            "enabled": bool((cfg.get("repetition") or {}).get("enabled", False)),
>>>>>>> origin/main
            "fail_line_repeats": _clamp_int(repetition_fail_repeats, 6, 1, 150),
        },
        "required": {
            "enabled": bool((cfg.get("required") or {}).get("enabled", False)),
            "keywords_csv": str((cfg.get("required") or {}).get("keywords_csv", "")),
            "json_fields_csv": str((cfg.get("required") or {}).get("json_fields_csv", "")),
        },
        "format": {
            "enabled": bool((cfg.get("format") or {}).get("enabled", False)),
            "sections_csv": str((cfg.get("format") or {}).get("sections_csv", "")),
        },
        "leakage": {"enabled": bool((cfg.get("leakage") or {}).get("enabled", False))},
<<<<<<< HEAD
        "tool": {"enabled": bool(tool_cfg.get("enabled", True))},
=======
        "tool": {"enabled": bool(tool_cfg.get("enabled", False))},
>>>>>>> origin/main
    }
    if normalized["json"]["mode"] not in ("if_json", "always", "off"):
        normalized["json"]["mode"] = "if_json"
    return normalized


def eval_config_version_hash(eval_config: Any) -> str:
    """Return a stable hash of the normalized eval config for change detection."""
    cfg = normalize_eval_config(eval_config) if eval_config else {}
    blob = json.dumps(cfg, sort_keys=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


CHECK_KEYS = [
    "empty",
    "latency",
    "status_code",
    "refusal",
    "json",
    "length",
    "repetition",
    "required",
    "format",
    "leakage",
    "tool",
]

PASS_STATUS = "pass"
FAIL_STATUS = "fail"
NOT_APPLICABLE_STATUS = "not_applicable"
EVALUATED_STATUSES = {PASS_STATUS, FAIL_STATUS}
# For aggregation in MVP, only explicit failures count as failed.
# not_applicable is neutral and excluded from failed counts.
FAILISH_STATUSES = {FAIL_STATUS}


def _fold_required_status(status_map: Dict[str, str]) -> str:
    parts = [status_map.get("required_keywords"), status_map.get("required_json_fields")]
    values = [v for v in parts if isinstance(v, str)]
    if not values:
        return NOT_APPLICABLE_STATUS
    if any(v == FAIL_STATUS for v in values):
        return FAIL_STATUS
    if any(v == PASS_STATUS for v in values):
        return PASS_STATUS
    return NOT_APPLICABLE_STATUS


def _build_steps_from_payload(
    payload: Any,
    agent_id: Optional[str] = None,
    step_order_base: int = 1,
) -> List[Dict[str, Any]]:
    """Build behavior validation steps from a single snapshot payload (canonical, multi-provider)."""
    base_meta = {
        "agent_id": agent_id,
        "source_id": None,
        "source_type": "snapshot",
    }
    return response_to_canonical_steps(
        payload,
        provider_hint=None,
        step_order_base=float(step_order_base),
        base_meta=base_meta,
    )


def _run_tool_policy_for_snapshot(
    db: Session,
    project_id: int,
    agent_id: Optional[str],
    payload: Any,
) -> str:
    """Run tool-policy validation for a single snapshot payload. Returns 'pass' or 'fail'."""
    steps = _build_steps_from_payload(payload, agent_id=agent_id)
    rules = (
        db.query(BehaviorRule)
        .filter(BehaviorRule.project_id == project_id, BehaviorRule.enabled.is_(True))
        .filter(
            (BehaviorRule.scope_type == "project")
            | ((BehaviorRule.scope_type == "agent") & (BehaviorRule.scope_ref == (agent_id or "")))
        )
        .all()
    )
    if not rules:
        return "pass"
    effective_rules, _ = resolve_effective_rules(rules, steps)
    status_out, _, _ = run_behavior_validation(effective_rules, steps)
    return status_out


def _evaluate_one_snapshot(
    s: Dict[str, Any],
    cfg: Dict[str, Any],
    baseline_len: Optional[float],
    required_keywords: List[str],
    required_json_fields: List[str],
    required_sections: List[str],
    db: Optional[Session] = None,
    project_id: Optional[int] = None,
    agent_id: Optional[str] = None,
) -> Dict[str, str]:
    """Run all enabled checks for one snapshot; returns status_map (check id -> status)."""
    text = str(s.get("response_text") or "")
    trimmed = text.strip()
    status_map: Dict[str, str] = {}

    if cfg["empty"]["enabled"]:
        if len(trimmed) < cfg["empty"]["min_chars"]:
            status_map["empty"] = FAIL_STATUS
        else:
            status_map["empty"] = PASS_STATUS

    if cfg["latency"]["enabled"]:
        if isinstance(s.get("latency_ms"), (int, float)):
            if s["latency_ms"] >= cfg["latency"]["fail_ms"]:
                status_map["latency"] = FAIL_STATUS
            else:
                status_map["latency"] = PASS_STATUS
        else:
            status_map["latency"] = NOT_APPLICABLE_STATUS

    if cfg["status_code"]["enabled"]:
        if isinstance(s.get("status_code"), int):
            if s["status_code"] >= cfg["status_code"]["fail_from"]:
                status_map["status_code"] = FAIL_STATUS
            else:
                status_map["status_code"] = PASS_STATUS
        else:
            status_map["status_code"] = NOT_APPLICABLE_STATUS

    if cfg["refusal"]["enabled"]:
        if trimmed:
            status_map["refusal"] = FAIL_STATUS if _detect_refusal(trimmed) else PASS_STATUS
        else:
            status_map["refusal"] = NOT_APPLICABLE_STATUS

    if cfg["json"]["enabled"]:
        mode = cfg["json"]["mode"]
        should_check = False
        parsed_json = None
        if mode == "off":
            status_map["json"] = NOT_APPLICABLE_STATUS
        else:
            should_check = mode == "always" or _looks_like_json(trimmed)
            if should_check:
                try:
                    parsed_json = json.loads(trimmed)
                    status_map["json"] = PASS_STATUS
                except Exception:
                    status_map["json"] = FAIL_STATUS
            else:
                status_map["json"] = NOT_APPLICABLE_STATUS

        if cfg["required"]["enabled"] and required_json_fields:
            if not should_check:
                status_map["required_json_fields"] = NOT_APPLICABLE_STATUS
            elif isinstance(parsed_json, dict):
                missing = [f for f in required_json_fields if f not in parsed_json]
                status_map["required_json_fields"] = FAIL_STATUS if missing else PASS_STATUS
            else:
                status_map["required_json_fields"] = NOT_APPLICABLE_STATUS

    if cfg["length"]["enabled"]:
        # Length drift is only meaningful when we have a non-zero baseline and a non-empty response.
        if baseline_len and baseline_len > 0 and len(trimmed) > 0:
            ratio = abs(len(trimmed) - baseline_len) / baseline_len
            fail_ratio = cfg["length"]["fail_ratio"]
            if ratio >= fail_ratio:
                status_map["length"] = FAIL_STATUS
            else:
                status_map["length"] = PASS_STATUS
        else:
            status_map["length"] = NOT_APPLICABLE_STATUS

    if cfg["repetition"]["enabled"]:
        if trimmed:
            max_repeat = _max_line_repeat_count(trimmed)
            fail_repeats = cfg["repetition"]["fail_line_repeats"]
            if max_repeat >= fail_repeats:
                status_map["repetition"] = FAIL_STATUS
            else:
                status_map["repetition"] = PASS_STATUS
        else:
            status_map["repetition"] = NOT_APPLICABLE_STATUS

    if cfg["required"]["enabled"] and required_keywords:
        lower = trimmed.lower()
        missing_keywords = [k for k in required_keywords if k.lower() not in lower]
        status_map["required_keywords"] = FAIL_STATUS if missing_keywords else PASS_STATUS

    if cfg["required"]["enabled"]:
        if required_keywords or required_json_fields:
            status_map["required"] = _fold_required_status(status_map)
        else:
            status_map["required"] = NOT_APPLICABLE_STATUS

    if cfg["format"]["enabled"]:
        if required_sections:
            lower = trimmed.lower()
            missing_sections = [sct for sct in required_sections if sct.lower() not in lower]
            status_map["format"] = FAIL_STATUS if missing_sections else PASS_STATUS
        else:
            status_map["format"] = NOT_APPLICABLE_STATUS

    if cfg["leakage"]["enabled"]:
        if trimmed:
            status_map["leakage"] = FAIL_STATUS if _detect_leakage_indicators(trimmed) else PASS_STATUS
        else:
            status_map["leakage"] = NOT_APPLICABLE_STATUS

    if cfg["tool"]["enabled"]:
        if db is not None and project_id is not None and s.get("payload") is not None:
            status_map["tool"] = _run_tool_policy_for_snapshot(
                db, project_id, agent_id or s.get("agent_id"), s["payload"]
            )
        else:
            status_map["tool"] = NOT_APPLICABLE_STATUS

    return status_map


def evaluate_recent_snapshots(
    db: Session,
    project_id: int,
    agent_id: str,
    eval_config: Any,
    get_config_at: Optional[Callable[[Any], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Evaluate recent snapshots. If get_config_at(created_at) is provided, each snapshot is evaluated
    with the eval config that was active at that snapshot's created_at (so logs before a config
    change use the old config, logs after use the new one).
    """
    current_cfg = normalize_eval_config(eval_config)
    window_limit = current_cfg["window"]["limit"]

    rows: List[Snapshot] = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id == agent_id,
            Snapshot.is_deleted.is_(False),
        )
        .order_by(Snapshot.created_at.desc())
        .limit(window_limit)
        .all()
    )
    rows.reverse()

    snapshots = []
    for s in rows:
        snapshots.append(
            {
                "id": s.id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "response_text": s.response or "",
                "latency_ms": s.latency_ms,
                "status_code": s.status_code,
                "tokens_used": s.tokens_used,
                "cost": s.cost,
                "payload": s.payload,
                "agent_id": s.agent_id,
            }
        )

    total = len(snapshots)
    lengths = [len(str(s["response_text"]).strip()) for s in snapshots if len(str(s["response_text"]).strip()) > 0]
    baseline_len = median(lengths) if lengths else None

    stats: Dict[str, Dict[str, Any]] = {k: {"enabled": False, "failed": 0, "applicable": 0} for k in CHECK_KEYS}

    per_snapshot = []
    for s in snapshots:
        if get_config_at is not None:
            cfg = normalize_eval_config(get_config_at(s["created_at"]))
        else:
            cfg = current_cfg

        required_keywords = _parse_csv(cfg["required"]["keywords_csv"])
        required_json_fields = _parse_csv(cfg["required"]["json_fields_csv"])
        required_sections = _parse_csv(cfg["format"]["sections_csv"])

        status_map = _evaluate_one_snapshot(
            s, cfg, baseline_len, required_keywords, required_json_fields, required_sections,
            db=db, project_id=project_id, agent_id=agent_id,
        )

        for key in CHECK_KEYS:
            if not cfg[key]["enabled"]:
                continue
            stats[key]["enabled"] = True
            status = status_map.get(key)
            if status in EVALUATED_STATUSES:
                stats[key]["applicable"] += 1
            if status in FAILISH_STATUSES:
                stats[key]["failed"] += 1

        per_snapshot.append(
            {
                "snapshot_id": s["id"],
                "created_at": s["created_at"],
                "checks": status_map,
            }
        )

    checks = []
    total_failed = 0
    for key in CHECK_KEYS:
        st = stats[key]
        if st["enabled"]:
            total_failed += st["failed"]
        checks.append(
            {
                "id": key,
                "enabled": st["enabled"],
                "failed": st["failed"],
                "applicable": st["applicable"],
            }
        )

    overall = "na"
    if current_cfg["enabled"]:
        if total == 0:
            overall = "na"
        elif total_failed > 0:
            overall = "review"
        else:
            overall = "ok"

    return {
        "agent_id": agent_id,
        "config": current_cfg,
        "window_limit": window_limit,
        "total_snapshots": total,
        "overall": overall,
        "checks": checks,
        "per_snapshot": per_snapshot,
    }


def evaluate_one_snapshot_at_save(
    response_text: str,
    latency_ms: Optional[int] = None,
    status_code: Optional[int] = None,
    tokens_used: Optional[int] = None,
    cost: Optional[float] = None,
    eval_config: Any = None,
    payload: Any = None,
    project_id: Optional[int] = None,
    agent_id: Optional[str] = None,
    db: Optional[Session] = None,
    baseline_len: Optional[float] = None,
) -> Dict[str, str]:
    """
    Evaluate a single snapshot at save time. Used to persist eval check results
    so Live View display does not change when the user later changes eval config.
    baseline_len defaults to None (so length is not applied at ingest-time), but callers
    like Release Gate drift can pass a computed baseline to enable length evaluation.
    When payload, project_id, and db are provided, the tool-policy check is run.
    """
    cfg = normalize_eval_config(eval_config or {})
    s = {
        "response_text": response_text or "",
        "latency_ms": latency_ms,
        "status_code": status_code,
        "tokens_used": tokens_used,
        "cost": cost,
        "payload": payload,
        "agent_id": agent_id,
    }
    required_keywords = _parse_csv(cfg["required"]["keywords_csv"])
    required_json_fields = _parse_csv(cfg["required"]["json_fields_csv"])
    required_sections = _parse_csv(cfg["format"]["sections_csv"])
    return _evaluate_one_snapshot(
        s, cfg, baseline_len=baseline_len, required_keywords=required_keywords,
        required_json_fields=required_json_fields, required_sections=required_sections,
        db=db, project_id=project_id, agent_id=agent_id,
    )


def aggregate_stored_eval_checks(
    snapshots: List[Snapshot],
    agent_id: str,
    eval_config: Any,
) -> Dict[str, Any]:
    """
    Build the same response shape as evaluate_recent_snapshots from stored
    eval_checks_result on each snapshot. Used when all snapshots have
    eval_checks_result so we don't recompute with current config.
    """
    current_cfg = normalize_eval_config(eval_config or {})
    window_limit = current_cfg["window"]["limit"]
    total = len(snapshots)

    stats: Dict[str, Dict[str, Any]] = {k: {"enabled": False, "failed": 0, "applicable": 0} for k in CHECK_KEYS}
    per_snapshot = []

    for s in snapshots:
        stored = getattr(s, "eval_checks_result", None) or {}
        if not isinstance(stored, dict):
            stored = {}

        # Normalize stored keys: required_keywords / required_json_fields -> "required" for aggregation
        status_map = dict(stored)
        if "required" not in status_map and (
            "required_keywords" in status_map or "required_json_fields" in status_map
        ):
            status_map["required"] = _fold_required_status(status_map)

        for key in CHECK_KEYS:
            # Consider check "enabled" if it was in config at save time OR if it appears in stored result (so baseline UI can show "applied" checks when no AgentDisplaySetting exists)
            if current_cfg[key]["enabled"] or key in status_map:
                stats[key]["enabled"] = True
            if not stats[key]["enabled"]:
                continue
            status = status_map.get(key)
            if status in EVALUATED_STATUSES:
                stats[key]["applicable"] += 1
            if status in FAILISH_STATUSES:
                stats[key]["failed"] += 1

        per_snapshot.append({
            "snapshot_id": s.id,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "checks": status_map,
        })

    checks = []
    total_failed = 0
    for key in CHECK_KEYS:
        st = stats[key]
        if st["enabled"]:
            total_failed += st["failed"]
        checks.append({
            "id": key,
            "enabled": st["enabled"],
            "failed": st["failed"],
            "applicable": st["applicable"],
        })

    overall = "na"
    if current_cfg["enabled"]:
        if total == 0:
            overall = "na"
        elif total_failed > 0:
            overall = "review"
        else:
            overall = "ok"

    return {
        "agent_id": agent_id,
        "config": current_cfg,
        "window_limit": window_limit,
        "total_snapshots": total,
        "overall": overall,
        "checks": checks,
        "per_snapshot": per_snapshot,
    }

