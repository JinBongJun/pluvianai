"""
Shared helpers for extracting tool_calls from request/response payloads.
"""
import json
from typing import Any, List, Dict


_MAX_TOOL_ARGS_BYTES = 65536  # 64KB


def normalize_tool_name(name: Any) -> str:
    """
    Normalize tool name for canonical step and policy comparison: strip, lower, collapse whitespace.
    Returns empty string if result would be empty.
    """
    s = str(name or "").strip().lower()
    return " ".join(s.split())


def parse_tool_args(raw_args: Any) -> Dict[str, Any]:
    """
    Normalize tool arguments to a dict (for canonical step layer).
    Never raises. On invalid JSON or non-dict parse result, returns
    {"_raw": raw_string, "_invalid": True} so policy can treat parse failure.
    Size limit 64KB (str length or dict serialized); over limit returns _invalid + _too_large.
    """
    if isinstance(raw_args, str):
        if len(raw_args) > _MAX_TOOL_ARGS_BYTES:
            return {
                "_invalid": True,
                "_too_large": True,
                "_raw": raw_args[:1024],
            }
        try:
            parsed = json.loads(raw_args)
            if isinstance(parsed, dict):
                return parsed
            return {"_raw": raw_args, "_invalid": True}
        except Exception:
            return {"_raw": raw_args, "_invalid": True}
    if isinstance(raw_args, dict):
        try:
            serialized = json.dumps(raw_args, sort_keys=True)
            if len(serialized) > _MAX_TOOL_ARGS_BYTES:
                return {"_invalid": True, "_too_large": True}
            return raw_args
        except (TypeError, ValueError):
            return {"_invalid": True}
    return {}


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
