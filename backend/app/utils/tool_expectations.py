from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.utils.tool_calls import normalize_tool_name


_TOKEN_RE = re.compile(r"[^a-z0-9]+")


def _normalize_token(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    return _TOKEN_RE.sub("", text)


def _normalize_fields(raw_fields: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_fields, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw_fields:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        out.append(
            {
                "name": name,
                "description": str(item.get("description") or "").strip() or None,
            }
        )
    return out


def assess_tool_expectations(
    tool_expectations: Any,
    tool_evidence: Any,
) -> Dict[str, Any]:
    """
    Lightweight diagnostics only.

    This helper does not affect gate pass/fail. It provides conservative
    visibility into whether configured expectation field names appear in
    replayed tool evidence previews.
    """
    if not isinstance(tool_expectations, list) or len(tool_expectations) == 0:
        return {
            "status": "not_configured",
            "summary": "No tool expectations were configured for this run.",
            "tools": [],
        }

    evidence_by_name: Dict[str, List[Dict[str, Any]]] = {}
    if isinstance(tool_evidence, list):
        for item in tool_evidence:
            if not isinstance(item, dict):
                continue
            normalized_name = normalize_tool_name(item.get("name"))
            if not normalized_name:
                continue
            evidence_by_name.setdefault(normalized_name, []).append(item)

    tools_out: List[Dict[str, Any]] = []
    matched_tool_count = 0
    for tool in tool_expectations:
        if not isinstance(tool, dict):
            continue
        name = str(tool.get("name") or "").strip()
        if not name:
            continue
        normalized_name = normalize_tool_name(name)
        tool_type = str(tool.get("tool_type") or "retrieval").strip().lower()
        if tool_type not in {"retrieval", "action"}:
            tool_type = "retrieval"
        configured_fields = _normalize_fields(
            tool.get("expected_action_fields")
            if tool_type == "action"
            else tool.get("expected_result_fields")
        )
        matching_evidence = evidence_by_name.get(normalized_name, [])
        haystack = " ".join(
            str(item.get("result_preview") or item.get("arguments_preview") or "").strip()
            for item in matching_evidence
            if isinstance(item, dict)
        )
        normalized_haystack = _normalize_token(haystack)
        matched_fields: List[str] = []
        missing_fields: List[str] = []
        for field in configured_fields:
            field_name = str(field.get("name") or "").strip()
            normalized_field = _normalize_token(field_name)
            if normalized_field and normalized_haystack and normalized_field in normalized_haystack:
                matched_fields.append(field_name)
            else:
                missing_fields.append(field_name)
        if configured_fields and len(missing_fields) == 0:
            matched_tool_count += 1
        tools_out.append(
            {
                "name": name,
                "tool_type": tool_type,
                "configured_fields": [field["name"] for field in configured_fields],
                "matched_fields": matched_fields,
                "missing_fields": missing_fields,
                "evidence_rows": len(matching_evidence),
                "result_guide": str(tool.get("result_guide") or "").strip() or None,
                "status": (
                    "matched"
                    if configured_fields and len(missing_fields) == 0
                    else "partial"
                    if matched_fields
                    else "missing"
                    if configured_fields
                    else "no_fields"
                ),
            }
        )

    status = "available" if tools_out else "not_configured"
    summary = f"{matched_tool_count}/{len(tools_out)} tool expectation set(s) fully matched available evidence."
    return {
        "status": status,
        "summary": summary,
        "tools": tools_out,
    }
