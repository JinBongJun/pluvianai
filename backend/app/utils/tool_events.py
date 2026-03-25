"""
Normalize and validate optional tool_events[] from SDK ingest.

See docs/release-gate-tool-io-grounding-plan.md (Commit A1).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.utils.secret_redaction import redact_secrets
from app.core.logging_config import logger

MAX_TOOL_EVENTS = 50
# Per-event cap after JSON serialization (bytes-ish via len of utf-8 not exact but good enough)
MAX_EVENT_JSON_CHARS = 65536
_ALLOWED_KINDS = frozenset({"tool_call", "tool_result", "action"})
_ALLOWED_STATUS = frozenset({"ok", "error", "skipped", "pending"})


def normalize_tool_events(raw: Any) -> Optional[List[Dict[str, Any]]]:
    """
    Return a sanitized list of tool event dicts, or None if input is empty/invalid.
    Drops invalid rows; never raises.
    """
    if raw is None:
        return None
    if not isinstance(raw, list):
        logger.debug("tool_events skipped: payload is not a list")
        return None
    raw_len = len(raw)
    dropped_invalid = 0
    out: List[Dict[str, Any]] = []
    for item in raw[:MAX_TOOL_EVENTS]:
        if not isinstance(item, dict):
            dropped_invalid += 1
            continue
        kind = str(item.get("kind") or "").strip().lower()
        if kind not in _ALLOWED_KINDS:
            dropped_invalid += 1
            continue
        name = item.get("name")
        call_id = item.get("call_id")
        row: Dict[str, Any] = {
            "kind": kind,
            "name": str(name).strip() if name is not None else "",
        }
        if call_id is not None and str(call_id).strip():
            row["call_id"] = str(call_id).strip()
        if "input" in item:
            row["input"] = item.get("input")
        if "output" in item:
            row["output"] = item.get("output")
        status = item.get("status")
        if status is not None:
            s = str(status).strip().lower()
            if s in _ALLOWED_STATUS:
                row["status"] = s
        ts_ms = item.get("ts_ms")
        if ts_ms is not None:
            try:
                row["ts_ms"] = int(ts_ms)
            except (TypeError, ValueError):
                pass
        try:
            encoded = json.dumps(row, default=str)
        except (TypeError, ValueError):
            dropped_invalid += 1
            continue
        if len(encoded) > MAX_EVENT_JSON_CHARS:
            stub: Dict[str, Any] = {
                "kind": kind,
                "name": row.get("name") or "",
                "error": "event_too_large",
            }
            cid = row.get("call_id")
            if cid is not None and str(cid).strip():
                stub["call_id"] = str(cid).strip()
            row = stub
        redacted = redact_secrets(row)
        if isinstance(redacted, dict):
            out.append(redacted)
    if raw_len > MAX_TOOL_EVENTS:
        logger.info(
            "tool_events truncated to max_events=%s (incoming=%s)",
            MAX_TOOL_EVENTS,
            raw_len,
        )
    if dropped_invalid:
        logger.debug("tool_events dropped_invalid_rows=%s", dropped_invalid)
    return out if out else None
