"""
Helpers for deriving canonical tool evidence from captured snapshot/replay data.

Goal:
- prefer captured tool history (`tool_events` / timeline-like rows)
- fall back to stored `tool_calls_summary`
- expose one ordered tool-name sequence for baseline/runtime comparisons
"""

from __future__ import annotations

from typing import Any, Dict, List

from app.utils.tool_calls import normalize_tool_name
from app.utils.tool_events import normalize_tool_events


def tool_sequence_from_timeline_rows(rows: Any) -> List[str]:
    """
    Build ordered tool-name sequence from timeline-like rows.

    Accepted row shape:
    - {"step_type": "tool_call", "tool_name": "..."}
    - {"kind": "tool_call", "name": "..."}
    """
    if not isinstance(rows, list):
        return []

    out: List[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        row_type = str(row.get("step_type") or row.get("kind") or "").strip().lower()
        if row_type != "tool_call":
            continue
        name = normalize_tool_name(row.get("tool_name") or row.get("name"))
        if name:
            out.append(name)
    return out


def tool_sequence_from_payload_tool_events(payload: Any) -> List[str]:
    """
    Build ordered tool-name sequence from payload.tool_events.
    """
    if not isinstance(payload, dict):
        return []
    events = normalize_tool_events(payload.get("tool_events"))
    if not events:
        return []
    return tool_sequence_from_timeline_rows(events)


def tool_sequence_from_summary(summary: Any) -> List[str]:
    """
    Build ordered tool-name sequence from tool_calls_summary.
    """
    if not isinstance(summary, list):
        return []

    out: List[str] = []
    for item in summary:
        if not isinstance(item, dict):
            continue
        name = normalize_tool_name(item.get("name"))
        if name:
            out.append(name)
    return out


def tool_sequence_from_snapshot_payload_or_summary(
    payload: Any,
    tool_calls_summary: Any,
) -> List[str]:
    """
    Canonical baseline/runtime sequence:
    1. payload.tool_events
    2. tool_calls_summary
    """
    seq = tool_sequence_from_payload_tool_events(payload)
    if seq:
        return seq
    return tool_sequence_from_summary(tool_calls_summary)
