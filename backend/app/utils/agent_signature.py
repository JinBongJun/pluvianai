from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, Iterable, Optional, Tuple


_WHITESPACE_RE = re.compile(r"[ \t]+")


def _normalize_system_prompt(value: Optional[str]) -> str:
    if not value:
        return ""
    s = str(value).replace("\r\n", "\n").strip()
    if not s:
        return ""
    lines = []
    for line in s.split("\n"):
        line = _WHITESPACE_RE.sub(" ", line).strip()
        lines.append(line)
    return "\n".join(lines).strip()


def _round_number(v: Any) -> Any:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int,)):
        return v
    if isinstance(v, float):
        return round(v, 4)
    if isinstance(v, str):
        # attempt numeric strings (common in loose payloads)
        try:
            f = float(v)
            return round(f, 4)
        except Exception:
            return v
    return v


def _canonicalize(obj: Any) -> Any:
    """
    Produce a JSON-canonical, hash-stable structure:
    - dict keys sorted
    - None values dropped
    - numbers rounded (floats) where applicable
    - lists canonicalized (order preserved; callers should sort when order is semantically irrelevant)
    """
    if obj is None:
        return None
    if isinstance(obj, dict):
        out = {}
        for k in sorted(obj.keys(), key=lambda x: str(x)):
            v = _canonicalize(obj.get(k))
            if v is None:
                continue
            out[str(k)] = v
        return out
    if isinstance(obj, list):
        return [_canonicalize(x) for x in obj]
    if isinstance(obj, (int, float, bool, str)):
        return _round_number(obj)
    return str(obj)


def _extract_generation_settings(request_payload: Dict[str, Any]) -> Dict[str, Any]:
    allow = [
        "temperature",
        "top_p",
        "max_tokens",
        "max_completion_tokens",
        "presence_penalty",
        "frequency_penalty",
        "seed",
        "stream",
        "response_format",
        "logit_bias",
        "reasoning",
        "thinking",
    ]
    out: Dict[str, Any] = {}
    for k in allow:
        if k in request_payload:
            v = request_payload.get(k)
            if v is None:
                continue
            out[k] = v
    return _canonicalize(out) or {}


def _tool_sort_key(tool_obj: Any) -> Tuple[str, str]:
    """
    Sort tools deterministically. Prefer function name, then canonical JSON.
    """
    name = ""
    if isinstance(tool_obj, dict):
        # OpenAI tools: {"type":"function","function":{"name":"...","parameters":{...}}}
        fn = tool_obj.get("function")
        if isinstance(fn, dict) and fn.get("name"):
            name = str(fn.get("name"))
        # Legacy function shape may have {"name": "...", "parameters": {...}}
        elif tool_obj.get("name"):
            name = str(tool_obj.get("name"))
    canon = json.dumps(_canonicalize(tool_obj), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return (name, canon)


def _extract_tooling(request_payload: Dict[str, Any]) -> Dict[str, Any]:
    tooling: Dict[str, Any] = {}
    if isinstance(request_payload.get("tools"), list):
        tools = list(request_payload.get("tools") or [])
        tools_sorted = sorted(tools, key=_tool_sort_key)
        tooling["tools"] = _canonicalize(tools_sorted)
    elif isinstance(request_payload.get("functions"), list):
        funcs = list(request_payload.get("functions") or [])
        funcs_sorted = sorted(funcs, key=_tool_sort_key)
        tooling["functions"] = _canonicalize(funcs_sorted)
    return tooling


def build_node_key(
    *,
    provider: Optional[str],
    model: Optional[str],
    system_prompt: Optional[str],
    request_payload: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Node identity key (v1.0): sha256(canonical_json)[:16] over:
    - provider
    - model
    - normalized system_prompt
    - generation_settings (subset)
    - tooling (tools/functions schema)

    NOTE: agent_name is intentionally excluded (UI label only).
    """
    req = request_payload if isinstance(request_payload, dict) else {}
    signature = {
        "provider": str(provider or "unknown"),
        "model": str(model or "unknown"),
        "system_prompt": _normalize_system_prompt(system_prompt),
        "generation_settings": _extract_generation_settings(req),
        "tooling": _extract_tooling(req),
    }
    canonical = _canonicalize(signature) or {}
    raw = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

