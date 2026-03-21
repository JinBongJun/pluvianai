"""
Canonical step layer: normalize provider-specific LLM responses into a single
step representation so Gate and Replay can evaluate behavior in a
provider-independent way.

Supports: OpenAI (tool_calls), Anthropic (content[].tool_use), Google (functionCall).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.utils.tool_calls import normalize_tool_name, parse_tool_args

# Canonical tool call: { "name": str, "arguments": dict }
# Canonical step: step_order, step_type ("llm_call" | "tool_call" | "tool_result"), tool_name?, tool_args?, tool_result? + base_meta


def _tool_name_empty_meta(normalized_name: str) -> Dict[str, Any]:
    """Return meta to attach when normalized tool name is empty."""
    return {"_tool_name_empty": True} if normalized_name == "" else {}


def _detect_provider(response_data: Any, provider_hint: Optional[str] = None) -> str:
    """
    Detect provider from hint or response shape.
    Returns 'openai' | 'anthropic' | 'google' | 'unknown'.
    Hint overrides shape. Order: OpenAI (choices[].message) -> Google (candidates[].content.parts) -> Anthropic (content[] + tool_use).
    """
    if provider_hint:
        h = str(provider_hint).strip().lower()
        if h in ("openai", "anthropic", "google"):
            return h
    if not isinstance(response_data, dict):
        return "unknown"
    # OpenAI: full conversation payloads (proxy) — messages with tool / assistant.tool_calls
    msgs = response_data.get("messages")
    if isinstance(msgs, list) and len(msgs) > 0:
        for m in msgs:
            if not isinstance(m, dict):
                continue
            role = str(m.get("role") or "").strip().lower()
            if role == "tool":
                return "openai"
            if role == "assistant" and m.get("tool_calls"):
                return "openai"
    # OpenAI: choices[0].message
    choices = response_data.get("choices")
    if isinstance(choices, list) and len(choices) > 0:
        c0 = choices[0] if isinstance(choices[0], dict) else {}
        if c0.get("message") is not None:
            return "openai"
    # Google: candidates[0].content with parts
    candidates = response_data.get("candidates")
    if isinstance(candidates, list) and len(candidates) > 0:
        c0 = candidates[0] if isinstance(candidates[0], dict) else {}
        content = c0.get("content")
        if isinstance(content, dict) and "parts" in content:
            return "google"
        if isinstance(content, list):
            return "google"
    # Anthropic: top-level "content" array with blocks (text / tool_use / tool_result)
    content = response_data.get("content")
    if isinstance(content, list) and len(content) > 0:
        first = content[0] if isinstance(content[0], dict) else {}
        if first.get("type") in ("text", "tool_use", "tool_result"):
            return "anthropic"
    return "unknown"


def _extract_openai(response_data: Any) -> List[Dict[str, Any]]:
    """Extract tool calls from OpenAI-style response (choices[].message.tool_calls only). Includes id for dedup."""
    out: List[Dict[str, Any]] = []
    if not isinstance(response_data, dict):
        return out
    choices = response_data.get("choices")
    if not isinstance(choices, list):
        return out
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        msg = choice.get("message")
        if not isinstance(msg, dict):
            continue
        tool_calls = msg.get("tool_calls")
        if not isinstance(tool_calls, list):
            continue
        for tc in tool_calls:
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function")
            if isinstance(fn, dict):
                name = fn.get("name") or fn.get("name_")
                args = fn.get("arguments")
            else:
                name = tc.get("name") or tc.get("function_name")
                args = tc.get("arguments")
            if name is not None:
                n = normalize_tool_name(name)
                out.append({
                    "id": tc.get("id"),
                    "name": n,
                    "arguments": parse_tool_args(args),
                    **_tool_name_empty_meta(n),
                })
    return out


def _extract_anthropic(response_data: Any) -> List[Dict[str, Any]]:
    """Extract tool calls from Anthropic Messages API (content[].type == 'tool_use'). Includes id for dedup."""
    out: List[Dict[str, Any]] = []
    if not isinstance(response_data, dict):
        return out
    content = response_data.get("content")
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        name = block.get("name")
        if name is None:
            continue
        n = normalize_tool_name(name)
        inp = block.get("input")
        out.append({
            "id": block.get("id"),
            "name": n,
            "arguments": parse_tool_args(inp) if inp is not None else {},
            **_tool_name_empty_meta(n),
        })
    return out


def _extract_google(response_data: Any) -> List[Dict[str, Any]]:
    """Extract tool calls from Google Gemini (all candidates[].content.parts[].functionCall)."""
    out: List[Dict[str, Any]] = []
    if not isinstance(response_data, dict):
        return out
    candidates = response_data.get("candidates")
    if not isinstance(candidates, list) or len(candidates) == 0:
        return out
    for c in candidates:
        if not isinstance(c, dict):
            continue
        content = c.get("content")
        if isinstance(content, dict):
            parts = content.get("parts")
        elif isinstance(content, list):
            parts = content
        else:
            continue
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            fc = part.get("functionCall")
            if not isinstance(fc, dict):
                continue
            name = fc.get("name")
            if name is None:
                continue
            n = normalize_tool_name(name)
            args = fc.get("args") or fc.get("arguments") or {}
            out.append({
                "id": fc.get("id"),
                "name": n,
                "arguments": parse_tool_args(args),
                **_tool_name_empty_meta(n),
            })
    return out


def _validate_and_dedup_tool_calls(
    tool_calls: List[Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], bool]:
    """
    Validate id consistency and deduplicate. Same id must have identical (name, args).
    Returns (deduped_list, id_conflict). If id_conflict, returned list is [] (entire response invalid).
    """
    id_map: Dict[Any, List[Dict[str, Any]]] = {}
    for tc in tool_calls:
        tid = tc.get("id")
        if tid is not None and tid != "":
            id_map.setdefault(tid, []).append(tc)

    id_conflict = False
    for group in id_map.values():
        if len(group) <= 1:
            continue
        first = group[0]
        fn, fa = first.get("name"), first.get("arguments")
        for other in group[1:]:
            if other.get("name") != fn or other.get("arguments") != fa:
                id_conflict = True
                break
        if id_conflict:
            break

    if id_conflict:
        return ([], True)

    seen_id: set = set()
    seen_fallback: set = set()
    result: List[Dict[str, Any]] = []
    for tc in tool_calls:
        tid = tc.get("id")
        if tid is not None and tid != "":
            if tid in seen_id:
                continue
            seen_id.add(tid)
            result.append(tc)
        else:
            key = ("fallback", tc.get("name"), json.dumps(tc.get("arguments") or {}, sort_keys=True))
            if key in seen_fallback:
                continue
            seen_fallback.add(key)
            result.append(tc)
    return (result, False)


def _normalize_tool_result_output_for_step(raw: Any) -> Dict[str, Any]:
    """Shape stored in trajectory tool_result JSON; keep JSON-serializable."""
    if raw is None:
        return {"output": None, "source": "provider_response"}
    if isinstance(raw, (dict, list)):
        return {"output": raw, "source": "provider_response"}
    return {"output": str(raw), "source": "provider_response"}


def _extract_anthropic_tool_results(response_data: Any) -> List[Dict[str, Any]]:
    """content[].type == tool_result (same message as tool_use when proxy merges turns)."""
    out: List[Dict[str, Any]] = []
    if not isinstance(response_data, dict):
        return out
    content = response_data.get("content")
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "tool_result":
            continue
        tid = block.get("tool_use_id") or block.get("id")
        raw_out = block.get("content")
        name = block.get("name")
        n = normalize_tool_name(name) if name is not None else ""
        cid = str(tid).strip() if tid is not None and str(tid).strip() else None
        out.append(
            {
                "call_id": cid,
                "name": n,
                "output": raw_out,
            }
        )
    return out


def _extract_openai_tool_results(response_data: Any) -> List[Dict[str, Any]]:
    """OpenAI: role=tool messages (conversation-shaped payloads) or rare message.role=tool."""
    out: List[Dict[str, Any]] = []
    if not isinstance(response_data, dict):
        return out
    msgs = response_data.get("messages")
    if isinstance(msgs, list):
        for m in msgs:
            if not isinstance(m, dict):
                continue
            if str(m.get("role") or "").strip().lower() != "tool":
                continue
            tid = m.get("tool_call_id")
            cid = str(tid).strip() if tid is not None and str(tid).strip() else None
            out.append({"call_id": cid, "name": "", "output": m.get("content")})
    choices = response_data.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            msg = choice.get("message")
            if not isinstance(msg, dict):
                continue
            if str(msg.get("role") or "").strip().lower() != "tool":
                continue
            tid = msg.get("tool_call_id")
            cid = str(tid).strip() if tid is not None and str(tid).strip() else None
            out.append({"call_id": cid, "name": "", "output": msg.get("content")})
    return out


def _extract_google_tool_results(response_data: Any) -> List[Dict[str, Any]]:
    """Gemini: parts[].functionResponse."""
    out: List[Dict[str, Any]] = []
    if not isinstance(response_data, dict):
        return out
    candidates = response_data.get("candidates")
    if not isinstance(candidates, list):
        return out
    for c in candidates:
        if not isinstance(c, dict):
            continue
        content = c.get("content")
        if isinstance(content, dict):
            parts = content.get("parts")
        elif isinstance(content, list):
            parts = content
        else:
            continue
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            fr = part.get("functionResponse")
            if not isinstance(fr, dict):
                continue
            name = fr.get("name")
            n = normalize_tool_name(name) if name is not None else ""
            resp = fr.get("response")
            out.append({"call_id": None, "name": n, "output": resp})
    return out


def _extract_tool_results_for_provider(provider: str, response_data: Any) -> List[Dict[str, Any]]:
    if provider == "anthropic":
        return _extract_anthropic_tool_results(response_data)
    if provider == "openai":
        return _extract_openai_tool_results(response_data)
    if provider == "google":
        return _extract_google_tool_results(response_data)
    return []


def response_to_canonical_tool_calls(
    response_data: Any,
    provider_hint: Optional[str] = None,
) -> tuple[List[Dict[str, Any]], str, bool]:
    """
    Convert provider-specific response to a list of canonical tool calls.
    Returns (tool_calls_list, provider, id_conflict).
    If response_data is proxy-style { "request", "response" }, the "response" part is used.
    """
    if isinstance(response_data, dict) and "response" in response_data:
        response_data = response_data["response"]
    provider = _detect_provider(response_data, provider_hint)
    if provider == "unknown":
        return ([], "unknown", False)
    if provider == "anthropic":
        raw = _extract_anthropic(response_data)
    elif provider == "google":
        raw = _extract_google(response_data)
    else:
        raw = _extract_openai(response_data)
    deduped, id_conflict = _validate_and_dedup_tool_calls(raw)
    if id_conflict:
        return ([], provider, True)
    return (deduped, provider, False)


def response_to_canonical_tool_calls_summary(
    response_data: Any,
    provider_hint: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Return tool calls in display/summary shape: [{ "name": str, "arguments": str | dict }].
    Use for UI/summary when provider is known so Anthropic/Google are supported.
    """
    tool_calls, _provider, _id_conflict = response_to_canonical_tool_calls(response_data, provider_hint)
    return [
        {"name": tc.get("name") or "", "arguments": tc.get("arguments") or ""}
        for tc in tool_calls
    ]


def response_to_canonical_steps(
    response_data: Any,
    *,
    provider_hint: Optional[str] = None,
    step_order_base: float = 1.0,
    base_meta: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Convert provider-specific response to canonical steps (llm_call + tool_call [+ tool_result] steps).
    tool_result rows come from Anthropic content[].tool_result, OpenAI role=tool messages,
    or Google functionResponse — when present in the same stored response blob.
    base_meta is merged into every step (e.g. agent_id, source_id, source_type, latency_ms).
    Sets _provider_unknown / _id_conflict in base when applicable.
    Returns list of step dicts with step_order, step_type, tool_name, tool_args, optional tool_result.
    """
    base = dict(base_meta or {})
    tool_calls, provider, id_conflict = response_to_canonical_tool_calls(response_data, provider_hint)
    if provider == "unknown":
        base["_provider_unknown"] = True
    if id_conflict:
        base["_id_conflict"] = True

    raw_response = response_data
    if isinstance(response_data, dict) and "response" in response_data:
        raw_response = response_data["response"]

    tool_result_rows: List[Dict[str, Any]] = []
    if isinstance(raw_response, dict) and provider in ("openai", "anthropic", "google"):
        tool_result_rows = _extract_tool_results_for_provider(provider, raw_response)

    steps: List[Dict[str, Any]] = []
    # Always one llm_call step
    steps.append({
        **base,
        "step_order": step_order_base,
        "step_type": "llm_call",
        "tool_name": None,
        "tool_args": {},
    })
    for i, tc in enumerate(tool_calls):
        raw_args = tc.get("arguments")
        merged_args: Dict[str, Any] = dict(raw_args) if isinstance(raw_args, dict) else {}
        tid = tc.get("id")
        if tid is not None and str(tid).strip():
            merged_args["_call_id"] = str(tid).strip()
        step_meta = {
            **base,
            "step_order": step_order_base + (i + 1) * 0.01,
            "step_type": "tool_call",
            "tool_name": tc.get("name") or "",
            "tool_args": merged_args,
        }
        if tc.get("_tool_name_empty"):
            step_meta["_tool_name_empty"] = True
        steps.append(step_meta)

    n_tc = len(tool_calls)
    for ti, tr in enumerate(tool_result_rows):
        call_id = tr.get("call_id")
        name = str(tr.get("name") or "").strip()
        tr_payload = _normalize_tool_result_output_for_step(tr.get("output"))
        if call_id:
            tr_payload["call_id"] = call_id
        ta: Dict[str, Any] = {}
        if call_id:
            ta["call_id"] = call_id
        steps.append(
            {
                **base,
                "step_order": step_order_base + (n_tc + 1 + ti) * 0.01,
                "step_type": "tool_result",
                "tool_name": name,
                "tool_args": ta,
                "tool_result": tr_payload,
            }
        )

    return sorted(steps, key=lambda x: float(x.get("step_order") or 0))
