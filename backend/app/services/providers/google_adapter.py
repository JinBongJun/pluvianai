from __future__ import annotations

import json
from copy import deepcopy
from typing import Any, Callable, Dict, List, Optional, Tuple


class GoogleProviderAdapter:
    provider_name = "google"

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
        contents = [
            {
                "role": "model" if m.get("role") == "assistant" else "user",
                "parts": [{"text": m.get("content", "")}],
            }
            for m in (messages or [{"role": "user", "content": ""}])
        ]

        out: Dict[str, Any] = {"contents": contents}

        generation_config: Dict[str, Any] = {}
        if knobs.get("temperature") is not None:
            generation_config["temperature"] = knobs["temperature"]
        if knobs.get("top_p") is not None:
            generation_config["topP"] = knobs["top_p"]
        if knobs.get("max_tokens") is not None:
            generation_config["maxOutputTokens"] = int(knobs["max_tokens"])
        if generation_config:
            out["generationConfig"] = generation_config

        if system_prompt:
            # REST docs typically use snake_case for this field.
            out["system_instruction"] = {"parts": [{"text": system_prompt}]}

        if tool_specs:
            out["tools"] = [
                {
                    "functionDeclarations": [
                        {
                            "name": t["name"],
                            "description": t.get("description") or "",
                            "parameters": t.get("schema")
                            or {"type": "object", "properties": {}},
                        }
                        for t in tool_specs
                    ]
                }
            ]

        if isinstance(tool_choice, dict):
            out["toolConfig"] = tool_choice

        return out

    def extract_token_usage(self, response_data: Any) -> Tuple[int, int]:
        if not isinstance(response_data, dict):
            return 0, 0

        meta = response_data.get("usageMetadata") or {}
        if isinstance(meta, dict):
            inp = meta.get("promptTokenCount") or 0
            out = meta.get("candidatesTokenCount") or meta.get("totalTokenCount") or 0
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
            error_code = str(err.get("status") or err.get("code") or "")
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

    def payload_fallback_variants(
        self, payload: Dict[str, Any]
    ) -> List[Tuple[str, Dict[str, Any]]]:
        """
        Build fallback request variants for Gemini payload-schema drift.

        Order matters: try field-name variant, then inline-system variant.
        """
        variants: List[Tuple[str, Dict[str, Any]]] = []
        has_snake = isinstance(payload.get("system_instruction"), dict)
        has_camel = isinstance(payload.get("systemInstruction"), dict)

        if has_snake and not has_camel:
            alt = deepcopy(payload)
            alt["systemInstruction"] = alt.pop("system_instruction")
            variants.append(("google_system_instruction_camel", alt))
        elif has_camel and not has_snake:
            alt = deepcopy(payload)
            alt["system_instruction"] = alt.pop("systemInstruction")
            variants.append(("google_system_instruction_snake", alt))

        inline_base = deepcopy(payload)
        sys_obj = inline_base.pop("system_instruction", None) or inline_base.pop(
            "systemInstruction", None
        )
        sys_text = ""
        if isinstance(sys_obj, dict):
            parts = sys_obj.get("parts")
            if isinstance(parts, list):
                fragments: List[str] = []
                for part in parts:
                    if isinstance(part, dict):
                        text = part.get("text")
                        if isinstance(text, str) and text.strip():
                            fragments.append(text.strip())
                sys_text = "\n\n".join(fragments).strip()

        if sys_text:
            contents = inline_base.get("contents")
            if not isinstance(contents, list) or not contents:
                contents = [{"role": "user", "parts": [{"text": ""}]}]
                inline_base["contents"] = contents

            first = contents[0] if isinstance(contents[0], dict) else {}
            parts = first.get("parts")
            if not isinstance(parts, list):
                parts = []
            if not parts:
                parts.append({"text": ""})

            first_part = parts[0] if isinstance(parts[0], dict) else {"text": ""}
            existing = first_part.get("text")
            existing_text = existing if isinstance(existing, str) else ""

            first_part["text"] = (
                f"{sys_text}\n\n{existing_text}".strip() if existing_text else sys_text
            )
            parts[0] = first_part
            first["parts"] = parts
            # Keep original role if it looks like 'model', else default to 'user'
            first_role = str(first.get("role") or "").lower()
            first["role"] = "user" if first_role != "model" else "model"
            contents[0] = first
            inline_base["contents"] = contents
            variants.append(("google_system_inlined_into_user", inline_base))

        return variants

