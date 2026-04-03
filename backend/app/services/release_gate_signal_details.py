from __future__ import annotations

import json
from typing import Any, Dict, Optional


REFUSAL_MARKERS = [
    "i cannot",
    "i can't",
    "unable to",
    "as an ai",
    "sorry, but i",
    "apologize",
]


def build_release_gate_signal_details(
    *,
    signals_checks: Dict[str, str],
    eval_config: Dict[str, Any],
    candidate_response_preview: str,
    latency_ms: Optional[int],
    status_code: Optional[int],
    baseline_len: Optional[int],
) -> Dict[str, Any]:
    if not isinstance(signals_checks, dict) or not signals_checks:
        return {}

    text_trimmed = str(candidate_response_preview or "").strip()
    actual_chars = len(text_trimmed)
    details: Dict[str, Any] = {}

    if "empty" in signals_checks:
        details["empty"] = {
            "status": signals_checks.get("empty"),
            "min_chars": eval_config.get("empty", {}).get("min_chars"),
            "actual_chars": actual_chars,
        }

    if "latency" in signals_checks:
        details["latency"] = {
            "status": signals_checks.get("latency"),
            "fail_ms": eval_config.get("latency", {}).get("fail_ms"),
            "actual_ms": latency_ms,
        }

    if "status_code" in signals_checks:
        details["status_code"] = {
            "status": signals_checks.get("status_code"),
            "fail_from": eval_config.get("status_code", {}).get("fail_from"),
            "actual_status": status_code,
        }

    if "refusal" in signals_checks:
        lowered = text_trimmed.lower()
        details["refusal"] = {
            "status": signals_checks.get("refusal"),
            "matched": any(marker in lowered for marker in REFUSAL_MARKERS) if lowered else None,
        }

    if "json" in signals_checks:
        mode = (eval_config.get("json") or {}).get("mode")
        looks_like_json = (
            (text_trimmed.startswith("{") and text_trimmed.endswith("}"))
            or (text_trimmed.startswith("[") and text_trimmed.endswith("]"))
        )
        parsed_ok: Optional[bool] = None
        if mode != "off" and (mode == "always" or looks_like_json):
            try:
                json.loads(text_trimmed)
                parsed_ok = True
            except Exception:
                parsed_ok = False
        details["json"] = {
            "status": signals_checks.get("json"),
            "mode": mode,
            "checked": (mode != "off") and (mode == "always" or looks_like_json),
            "parsed_ok": parsed_ok,
        }

    if "length" in signals_checks:
        fail_ratio = (eval_config.get("length") or {}).get("fail_ratio")
        ratio_val: Optional[float] = None
        if baseline_len and baseline_len > 0 and actual_chars > 0:
            ratio_val = abs(actual_chars - baseline_len) / float(baseline_len)
        details["length"] = {
            "status": signals_checks.get("length"),
            "fail_ratio": fail_ratio,
            "baseline_len": baseline_len,
            "actual_chars": actual_chars,
            "ratio": ratio_val,
        }

    if "repetition" in signals_checks:
        lines = [line.strip() for line in text_trimmed.split("\n") if len(line.strip()) >= 4]
        counts: Dict[str, int] = {}
        max_repeat = 0
        for line in lines:
            counts[line] = counts.get(line, 0) + 1
            if counts[line] > max_repeat:
                max_repeat = counts[line]
        details["repetition"] = {
            "status": signals_checks.get("repetition"),
            "fail_line_repeats": (eval_config.get("repetition") or {}).get("fail_line_repeats"),
            "max_line_repeats": max_repeat,
        }

    for key in ["required", "format", "leakage", "tool"]:
        if key in signals_checks:
            details[key] = {"status": signals_checks.get(key)}

    return details
