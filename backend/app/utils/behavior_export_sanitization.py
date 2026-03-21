"""
Behavior report export: role-based stripping of tool I/O previews (§14.3).

Viewer exports omit tool_result-related previews while preserving metadata (names, status,
execution_source) for auditing.
"""

from __future__ import annotations

import copy
from typing import Any, Optional

_REDACT = "[redacted]"


def _redact_tool_evidence_row(row: dict) -> dict:
    out = dict(row)
    if out.get("arguments_preview") is not None:
        out["arguments_preview"] = _REDACT
    if out.get("result_preview") is not None:
        out["result_preview"] = _REDACT
    return out


def _redact_tool_loop_event(ev: dict) -> dict:
    out = dict(ev)
    tr = out.get("tool_rows")
    if isinstance(tr, list):
        out["tool_rows"] = [
            _redact_tool_evidence_row(x) if isinstance(x, dict) else x for x in tr
        ]
    return out


def _deep_redact_viewer(obj: Any) -> Any:
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            if k == "tool_evidence" and isinstance(v, list):
                out[k] = [
                    _redact_tool_evidence_row(x) if isinstance(x, dict) else x for x in v
                ]
            elif k == "tool_loop_events" and isinstance(v, list):
                out[k] = [
                    _redact_tool_loop_event(x) if isinstance(x, dict) else x for x in v
                ]
            else:
                out[k] = _deep_redact_viewer(v)
        return out
    if isinstance(obj, list):
        return [_deep_redact_viewer(x) for x in obj]
    return obj


def sanitize_behavior_report_summary_for_export(summary: Any, *, role: Optional[str]) -> Any:
    """
    Return a copy of `summary` with tool I/O previews removed for project viewers.

    Owner/admin/member: unchanged summary.
    """
    if role != "viewer":
        return summary
    if summary is None:
        return summary
    try:
        cloned = copy.deepcopy(summary)
    except Exception:
        return summary
    return _deep_redact_viewer(cloned)
