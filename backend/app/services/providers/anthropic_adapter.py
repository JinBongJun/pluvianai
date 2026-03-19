from __future__ import annotations

import json
from typing import Any, Callable, Dict, List, Optional, Tuple


class AnthropicProviderAdapter:
    provider_name = "anthropic"

    def __init__(
        self,
        classify_error: Callable[[Optional[int], str, str], str],
        friendly_error_message: Callable[[str, str, str], str],
    ) -> None:
        self._classify_error = classify_error
        self._friendly_error_message = friendly_error_message

    def build_payload(
        self,
        *,
        system_prompt: str,
        messages: List[Dict[str, Any]],
        knobs: Dict[str, Any],
        tool_specs: List[Dict[str, Any]],
        tool_choice: Optional[Any],
        model_for_request: str,
    ) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "model": model_for_request,
            "messages": [
                {"role": m.get("role", "user"), "content": m.get("content", "")}
                for m in (messages or [{"role": "user", "content": ""}])
            ],
            "max_tokens": int(knobs.get("max_tokens") or 1024),
        }
        if system_prompt:
            out["system"] = system_prompt
        if knobs.get("temperature") is not None:
            out["temperature"] = knobs["temperature"]
        if knobs.get("top_p") is not None:
            out["top_p"] = knobs["top_p"]
        if tool_specs:
            out["tools"] = [
                {
                    "name": t["name"],
                    "description": t.get("description") or "",
                    "input_schema": t.get("schema")
                    or {"type": "object", "properties": {}},
                }
                for t in tool_specs
            ]
        if isinstance(tool_choice, dict):
            out["tool_choice"] = tool_choice
        return out

    def extract_token_usage(self, response_data: Any) -> Tuple[int, int]:
        if not isinstance(response_data, dict):
            return 0, 0

        anth_usage = response_data.get("usage") or {}
        if isinstance(anth_usage, dict):
            inp = anth_usage.get("input_tokens") or 0
            out = anth_usage.get("output_tokens") or 0
            if inp or out:
                return int(inp or 0), int(out or 0)

        inp = response_data.get("input_tokens") or 0
        out = response_data.get("output_tokens") or 0
        if inp or out:
            return int(inp or 0), int(out or 0)
        return 0, 0

    def extract_provider_error(
        self,
        *,
        model_for_request: str,
        response: Any,
    ) -> Dict[str, Any]:
        status_code = getattr(response, "status_code", None)

        error_code = ""
        message = ""
        body: Any = None
        try:
            body = response.json()
        except Exception:
            body = response.text

        if isinstance(body, dict):
            err = body.get("error")
            err = err if isinstance(err, dict) else {}
            error_code = str(err.get("type") or body.get("type") or "")
            message = str(err.get("message") or "")
        else:
            message = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)

        if not message:
            message = response.text if isinstance(response.text, str) else "Provider request failed."

        kind = self._classify_error(status_code, error_code, message)
        return {
            "status_code": status_code,
            "error_code": error_code,
            "error_type": kind,
            "error": message,
            "error_user_message": self._friendly_error_message(
                self.provider_name, kind, model_for_request
            ),
            "response_data": body,
        }

