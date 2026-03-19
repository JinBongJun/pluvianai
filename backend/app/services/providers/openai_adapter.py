from __future__ import annotations

import json
from typing import Any, Callable, Dict, List, Optional, Tuple


class OpenAIProviderAdapter:
    provider_name = "openai"

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
        out_messages: List[Dict[str, Any]] = []
        if system_prompt:
            out_messages.append({"role": "system", "content": system_prompt})
        out_messages.extend(messages or [{"role": "user", "content": ""}])

        out: Dict[str, Any] = {"model": model_for_request, "messages": out_messages}
        if knobs.get("temperature") is not None:
            out["temperature"] = knobs["temperature"]
        if knobs.get("top_p") is not None:
            out["top_p"] = knobs["top_p"]
        if knobs.get("max_tokens") is not None:
            out["max_tokens"] = knobs["max_tokens"]
        if tool_specs:
            out["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description") or "",
                        "parameters": t.get("schema")
                        or {"type": "object", "properties": {}},
                    },
                }
                for t in tool_specs
            ]
        if tool_choice is not None:
            out["tool_choice"] = tool_choice
        return out

    def extract_token_usage(
        self,
        response_data: Any,
    ) -> Tuple[int, int]:
        if not isinstance(response_data, dict):
            return 0, 0

        usage = response_data.get("usage") or {}
        if isinstance(usage, dict):
            prompt = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
            completion = (
                usage.get("completion_tokens") or usage.get("output_tokens") or 0
            )
            if prompt or completion:
                return int(prompt or 0), int(completion or 0)
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
            error_code = str(err.get("code") or err.get("type") or "")
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

