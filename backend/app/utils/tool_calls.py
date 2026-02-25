"""
Shared helpers for extracting tool_calls from request/response payloads.
"""
from typing import Any, List, Dict


def extract_tool_calls_summary(payload: Any) -> List[Dict[str, Any]]:
    """
    Best-effort extraction of tool calls from nested payload/response formats.
    Returns a list of { "name": str, "arguments": str | dict } for display/summary.
    """
    raw = _extract_tool_calls_from_payload(payload)
    out: List[Dict[str, Any]] = []
    for tc in raw:
        if not isinstance(tc, dict):
            continue
        fn = tc.get("function")
        if isinstance(fn, dict):
            name = fn.get("name") or fn.get("name_")
            args = fn.get("arguments")
        else:
            name = tc.get("name") or tc.get("function_name")
            args = tc.get("arguments")
        if name is None:
            continue
        out.append({
            "name": str(name),
            "arguments": args if args is not None else "",
        })
    return out


def _extract_tool_calls_from_payload(payload: Any) -> List[Dict[str, Any]]:
    """Walk payload and collect all tool_calls arrays."""
    out: List[Dict[str, Any]] = []

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            tool_calls = node.get("tool_calls")
            if isinstance(tool_calls, list):
                for tc in tool_calls:
                    if isinstance(tc, dict):
                        out.append(tc)
            for v in node.values():
                _walk(v)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(payload)
    return out
