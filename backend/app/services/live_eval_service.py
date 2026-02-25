from __future__ import annotations

import hashlib
import json
import re
from statistics import median
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.snapshot import Snapshot
from app.models.behavior_rule import BehaviorRule
from app.api.v1.endpoints.behavior import (
    _extract_tool_calls_from_payload,
    _parse_tool_args,
    _resolve_effective_rules,
    _run_behavior_validation,
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
    normalized = {
        "enabled": bool(cfg.get("enabled", True)),
        "window": {"limit": _clamp_int((cfg.get("window") or {}).get("limit"), 50, 10, 200)},
        "empty": {
            "enabled": bool((cfg.get("empty") or {}).get("enabled", True)),
            "min_chars": _clamp_int((cfg.get("empty") or {}).get("min_chars"), 16, 1, 10000),
        },
        "latency": {
            "enabled": bool((cfg.get("latency") or {}).get("enabled", True)),
            "warn_ms": _clamp_int((cfg.get("latency") or {}).get("warn_ms"), 2000, 100, 120000),
            "crit_ms": _clamp_int((cfg.get("latency") or {}).get("crit_ms"), 5000, 200, 180000),
        },
        "status_code": {
            "enabled": bool((cfg.get("status_code") or {}).get("enabled", True)),
            "warn_from": _clamp_int((cfg.get("status_code") or {}).get("warn_from"), 400, 100, 599),
            "crit_from": _clamp_int((cfg.get("status_code") or {}).get("crit_from"), 500, 100, 599),
        },
        "json": {
            "enabled": bool((cfg.get("json") or {}).get("enabled", True)),
            "mode": (cfg.get("json") or {}).get("mode") or "if_json",
        },
        "refusal": {"enabled": bool((cfg.get("refusal") or {}).get("enabled", True))},
        "length": {
            "enabled": bool((cfg.get("length") or {}).get("enabled", True)),
            "warn_ratio": _clamp_float((cfg.get("length") or {}).get("warn_ratio"), 0.35, 0.0, 2.0),
            "crit_ratio": _clamp_float((cfg.get("length") or {}).get("crit_ratio"), 0.75, 0.0, 3.0),
        },
        "repetition": {
            "enabled": bool((cfg.get("repetition") or {}).get("enabled", True)),
            "warn_line_repeats": _clamp_int((cfg.get("repetition") or {}).get("warn_line_repeats"), 3, 1, 100),
            "crit_line_repeats": _clamp_int((cfg.get("repetition") or {}).get("crit_line_repeats"), 6, 1, 150),
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
        "tokens": {
            "enabled": bool((cfg.get("tokens") or {}).get("enabled", True)),
            "warn": _clamp_int((cfg.get("tokens") or {}).get("warn"), 4000, 100, 200000),
        },
        "cost": {
            "enabled": bool((cfg.get("cost") or {}).get("enabled", True)),
            "warn": _clamp_float((cfg.get("cost") or {}).get("warn"), 0.5, 0.0, 100.0),
        },
        "leakage": {"enabled": bool((cfg.get("leakage") or {}).get("enabled", False))},
        "coherence": {
            "enabled": bool((cfg.get("coherence") or {}).get("enabled", False)),
            "min_score": _clamp_int((cfg.get("coherence") or {}).get("min_score"), 80, 0, 100),
        },
        "tool": {"enabled": bool((cfg.get("tool") or {}).get("enabled", True))},
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
    "tokens",
    "cost",
    "leakage",
    "coherence",
    "tool",
]


def _build_steps_from_payload(
    payload: Any,
    agent_id: Optional[str] = None,
    step_order_base: int = 1,
) -> List[Dict[str, Any]]:
    """Build behavior validation steps from a single snapshot payload (request/response)."""
    steps: List[Dict[str, Any]] = []
    # Payload may be { "request", "response" } or nested; extract tool_calls from anywhere
    tool_calls = _extract_tool_calls_from_payload(payload)
    if not tool_calls:
        steps.append({
            "step_order": step_order_base,
            "agent_id": agent_id,
            "source_id": None,
            "source_type": "snapshot",
            "step_type": "llm_call",
            "tool_name": None,
            "tool_args": {},
        })
        return steps
    steps.append({
        "step_order": step_order_base,
        "agent_id": agent_id,
        "source_id": None,
        "source_type": "snapshot",
        "step_type": "llm_call",
        "tool_name": None,
        "tool_args": {},
    })
    for i, tc in enumerate(tool_calls):
        function = tc.get("function") if isinstance(tc, dict) else {}
        function = function if isinstance(function, dict) else {}
        steps.append({
            "step_order": step_order_base + (i + 1) * 0.01,
            "agent_id": agent_id,
            "source_id": None,
            "source_type": "snapshot",
            "step_type": "tool_call",
            "tool_name": function.get("name") or tc.get("name"),
            "tool_args": _parse_tool_args(function.get("arguments") or tc.get("arguments")),
        })
    return sorted(steps, key=lambda x: x.get("step_order") or 0)


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
    effective_rules, _ = _resolve_effective_rules(rules, steps)
    status_out, _, _ = _run_behavior_validation(effective_rules, steps)
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
    """Run all enabled checks for one snapshot; returns status_map (check id -> 'pass'|'fail'|'not_implemented')."""
    text = str(s.get("response_text") or "")
    trimmed = text.strip()
    status_map: Dict[str, str] = {}

    if cfg["empty"]["enabled"]:
        if len(trimmed) < cfg["empty"]["min_chars"]:
            status_map["empty"] = "fail"
        else:
            status_map["empty"] = "pass"

    if cfg["latency"]["enabled"] and isinstance(s.get("latency_ms"), (int, float)):
        if s["latency_ms"] >= cfg["latency"]["warn_ms"]:
            status_map["latency"] = "fail"
        else:
            status_map["latency"] = "pass"

    if cfg["status_code"]["enabled"] and isinstance(s.get("status_code"), int):
        if s["status_code"] >= cfg["status_code"]["warn_from"]:
            status_map["status_code"] = "fail"
        else:
            status_map["status_code"] = "pass"

    if cfg["refusal"]["enabled"] and trimmed:
        status_map["refusal"] = "fail" if _detect_refusal(trimmed) else "pass"

    if cfg["json"]["enabled"] and cfg["json"]["mode"] != "off":
        should_check = cfg["json"]["mode"] == "always" or _looks_like_json(trimmed)
        if should_check:
            parsed_json = None
            try:
                parsed_json = json.loads(trimmed)
                status_map["json"] = "pass"
            except Exception:
                status_map["json"] = "fail"
            if cfg["required"]["enabled"] and required_json_fields and parsed_json and isinstance(parsed_json, dict):
                missing = [f for f in required_json_fields if f not in parsed_json]
                status_map["required_json_fields"] = "fail" if missing else "pass"

    if cfg["length"]["enabled"] and baseline_len and baseline_len > 0 and len(trimmed) > 0:
        ratio = abs(len(trimmed) - baseline_len) / baseline_len
        status_map["length"] = "fail" if ratio >= cfg["length"]["warn_ratio"] else "pass"

    if cfg["repetition"]["enabled"] and trimmed:
        max_repeat = _max_line_repeat_count(trimmed)
        status_map["repetition"] = "fail" if max_repeat >= cfg["repetition"]["warn_line_repeats"] else "pass"

    if cfg["required"]["enabled"] and required_keywords and trimmed:
        lower = trimmed.lower()
        missing_keywords = [k for k in required_keywords if k.lower() not in lower]
        status_map["required_keywords"] = "fail" if missing_keywords else "pass"

    if cfg["format"]["enabled"] and required_sections and trimmed:
        lower = trimmed.lower()
        missing_sections = [sct for sct in required_sections if sct.lower() not in lower]
        status_map["format"] = "fail" if missing_sections else "pass"

    if cfg["tokens"]["enabled"] and isinstance(s.get("tokens_used"), (int, float)):
        status_map["tokens"] = "fail" if s["tokens_used"] >= cfg["tokens"]["warn"] else "pass"

    if cfg["cost"]["enabled"] and isinstance(s.get("cost"), (int, float)):
        status_map["cost"] = "fail" if s["cost"] >= cfg["cost"]["warn"] else "pass"

    if cfg["leakage"]["enabled"] and trimmed:
        status_map["leakage"] = "fail" if _detect_leakage_indicators(trimmed) else "pass"

    if cfg["coherence"]["enabled"]:
        status_map["coherence"] = "not_implemented"

    if cfg["tool"]["enabled"] and db is not None and project_id is not None and s.get("payload") is not None:
        status_map["tool"] = _run_tool_policy_for_snapshot(
            db, project_id, agent_id or s.get("agent_id"), s["payload"]
        )

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
        .filter(Snapshot.project_id == project_id, Snapshot.agent_id == agent_id)
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
            stats[key]["applicable"] += 1
            if key == "required":
                if status_map.get("required_keywords") == "fail" or status_map.get("required_json_fields") == "fail":
                    stats[key]["failed"] += 1
            elif status_map.get(key) == "fail":
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
) -> Dict[str, str]:
    """
    Evaluate a single snapshot at save time. Used to persist eval check results
    so Live View display does not change when the user later changes eval config.
    baseline_len is None so length check is skipped at ingest.
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
        s, cfg, baseline_len=None, required_keywords=required_keywords,
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
        if "required_keywords" in status_map or "required_json_fields" in status_map:
            req_fail = status_map.get("required_keywords") == "fail" or status_map.get("required_json_fields") == "fail"
            status_map["required"] = "fail" if req_fail else "pass"

        for key in CHECK_KEYS:
            # Consider check "enabled" if it was in config at save time OR if it appears in stored result (so baseline UI can show "applied" checks when no AgentDisplaySetting exists)
            if current_cfg[key]["enabled"] or key in status_map:
                stats[key]["enabled"] = True
            if not stats[key]["enabled"]:
                continue
            stats[key]["applicable"] += 1
            if key == "required":
                if status_map.get("required_keywords") == "fail" or status_map.get("required_json_fields") == "fail":
                    stats[key]["failed"] += 1
            elif status_map.get(key) == "fail":
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

