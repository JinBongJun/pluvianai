import asyncio
import httpx
import json
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.snapshot import Snapshot
from app.models.evaluation_rubric import EvaluationRubric
from app.api.v1.endpoints.proxy import PROVIDER_URLS
from app.core.logging_config import logger
from app.core.config import settings
from app.core.credits import calculate_credits
from app.services.signal_detection_service import SignalDetectionService
from app.services.review_service import ReviewService
from app.models.alert import Alert
from app.services.data_normalizer import DataNormalizer
from app.models.replay_run import ReplayRun
from app.models.usage import Usage
from app.models.project import Project


def _persist_replay_usage(
    db: Optional[Session],
    project_id: Optional[int],
    results: List[Dict[str, Any]],
    track_platform_credits: bool,
) -> None:
    """
    Persist hosted replay credit usage for a replay batch.

    We only charge/store credits for platform-hosted runs. BYOK runs still execute,
    but they should not consume hosted credits.
    """
    if not db or not project_id or not track_platform_credits:
        return

    total_credits = sum(int(r.get("used_credits") or 0) for r in results if r.get("success"))
    if total_credits <= 0:
        return

    project = db.query(Project).filter(Project.id == project_id).first()
    owner_id = project.owner_id if project else None
    usage_record = Usage(
        user_id=owner_id,
        project_id=project_id,
        metric_name="guard_credits_replay",
        quantity=total_credits,
        unit="credits",
    )
    db.add(usage_record)


class ReplayService:
    """Service for re-executing historical AI requests for testing"""

    def __init__(self, max_concurrency: int = 50):
        self.semaphore = asyncio.Semaphore(max_concurrency)
        self.timeout = httpx.Timeout(60.0)

    def _content_to_text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            parts: List[str] = []
            for item in value:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    text_val = item.get("text")
                    if isinstance(text_val, str):
                        parts.append(text_val)
            return "\n".join(p for p in parts if p).strip()
        if isinstance(value, dict):
            text_val = value.get("text")
            if isinstance(text_val, str):
                return text_val
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    def _normalize_messages(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize arbitrary payload into {system_prompt, messages[user/assistant]}."""
        system_parts: List[str] = []
        messages: List[Dict[str, str]] = []

        system_from_payload = payload.get("system")
        if isinstance(system_from_payload, str) and system_from_payload.strip():
            system_parts.append(system_from_payload.strip())

        raw_messages = payload.get("messages")
        if isinstance(raw_messages, list):
            for item in raw_messages:
                if not isinstance(item, dict):
                    continue
                role = str(item.get("role") or "user").lower()
                text = self._content_to_text(item.get("content")).strip()
                if role == "system":
                    if text:
                        system_parts.append(text)
                    continue
                mapped_role = "assistant" if role in ("assistant", "model") else "user"
                if text:
                    messages.append({"role": mapped_role, "content": text})

        raw_contents = payload.get("contents")
        if not messages and isinstance(raw_contents, list):
            for entry in raw_contents:
                if not isinstance(entry, dict):
                    continue
                role = str(entry.get("role") or "user").lower()
                mapped_role = "assistant" if role in ("assistant", "model") else "user"
                parts = entry.get("parts")
                if isinstance(parts, list):
                    text = self._content_to_text(parts).strip()
                else:
                    text = self._content_to_text(entry.get("content")).strip()
                if text:
                    messages.append({"role": mapped_role, "content": text})

        if not messages:
            fallback = payload.get("prompt") or payload.get("input") or payload.get("user_message")
            fallback_text = self._content_to_text(fallback).strip()
            if fallback_text:
                messages.append({"role": "user", "content": fallback_text})

        return {
            "system_prompt": "\n\n".join([p for p in system_parts if p]).strip(),
            "messages": messages,
        }

    def _extract_generation_knobs(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        generation_cfg = payload.get("generationConfig")
        generation_cfg = generation_cfg if isinstance(generation_cfg, dict) else {}

        max_tokens = (
            payload.get("max_tokens")
            or payload.get("max_output_tokens")
            or payload.get("max_tokens_to_sample")
            or generation_cfg.get("maxOutputTokens")
        )
        temperature = payload.get("temperature")
        if temperature is None:
            temperature = generation_cfg.get("temperature")
        top_p = payload.get("top_p")
        if top_p is None:
            top_p = generation_cfg.get("topP")

        return {
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
        }

    def _normalize_tool_specs(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Normalize tools from various provider payload styles into:
        [{name, description, schema}]
        """
        raw_tools = payload.get("tools")
        if not isinstance(raw_tools, list):
            return []
        out: List[Dict[str, Any]] = []
        for item in raw_tools:
            if not isinstance(item, dict):
                continue
            fn = item.get("function")
            fn = fn if isinstance(fn, dict) else {}
            name = (
                str(fn.get("name") or item.get("name") or "").strip()
            )
            if not name:
                continue
            description = str(fn.get("description") or item.get("description") or "").strip()
            schema = fn.get("parameters")
            if not isinstance(schema, dict):
                schema = item.get("input_schema")
            if not isinstance(schema, dict):
                schema = item.get("parameters")
            if not isinstance(schema, dict):
                schema = {"type": "object", "properties": {}}
            out.append(
                {
                    "name": name,
                    "description": description,
                    "schema": schema,
                }
            )
        return out

    def _map_tool_choice_for_provider(
        self, payload: Dict[str, Any], target_provider: str
    ) -> Optional[Any]:
        raw_choice = payload.get("tool_choice")

        if target_provider == "openai":
            return raw_choice if raw_choice is not None else None

        if target_provider == "anthropic":
            if raw_choice is None:
                return None
            if isinstance(raw_choice, str):
                val = raw_choice.lower()
                if val == "none":
                    return None
                if val == "auto":
                    return {"type": "auto"}
                return {"type": "auto"}
            if isinstance(raw_choice, dict):
                fn = raw_choice.get("function")
                fn = fn if isinstance(fn, dict) else {}
                name = str(fn.get("name") or raw_choice.get("name") or "").strip()
                if name:
                    return {"type": "tool", "name": name}
            return {"type": "auto"}

        if target_provider == "google":
            if raw_choice is None:
                return None
            if isinstance(raw_choice, str):
                val = raw_choice.lower()
                if val == "none":
                    return {"functionCallingConfig": {"mode": "NONE"}}
                if val == "auto":
                    return {"functionCallingConfig": {"mode": "AUTO"}}
                return {"functionCallingConfig": {"mode": "AUTO"}}
            if isinstance(raw_choice, dict):
                fn = raw_choice.get("function")
                fn = fn if isinstance(fn, dict) else {}
                name = str(fn.get("name") or raw_choice.get("name") or "").strip()
                if name:
                    return {
                        "functionCallingConfig": {
                            "mode": "ANY",
                            "allowedFunctionNames": [name],
                        }
                    }
            return {"functionCallingConfig": {"mode": "AUTO"}}

        return None

    def _classify_error(self, status_code: Optional[int], error_code: str, message: str) -> str:
        text = f"{error_code} {message}".lower()
        if status_code in (401, 403) or "api key" in text or "permission" in text or "unauthorized" in text:
            return "auth"
        if (
            "model_not_found" in text
            or "model not found" in text
            or "unknown model" in text
            or "unsupported model" in text
        ):
            return "model_not_found"
        if status_code == 429 or "quota" in text or "rate limit" in text:
            return "quota"
        if status_code == 400 or "invalid_argument" in text or "invalid request" in text:
            return "payload_schema"
        if status_code and status_code >= 500:
            return "provider_server"
        return "provider_error"

    def _friendly_error_message(self, provider: str, kind: str, model_for_request: str) -> str:
        if kind == "auth":
            return f"{provider.title()} authentication failed. Check API key permissions."
        if kind == "model_not_found":
            return f"Model '{model_for_request}' is not available on {provider.title()}."
        if kind == "quota":
            return f"{provider.title()} quota/rate limit exceeded. Try later or use another model."
        if kind == "payload_schema":
            return (
                f"{provider.title()} rejected request payload format. "
                "Check tools/messages compatibility for selected provider."
            )
        if kind == "provider_server":
            return f"{provider.title()} server error occurred. Please retry shortly."
        if kind == "network":
            return f"Network error while calling {provider.title()}."
        return f"{provider.title()} replay request failed."

    def _extract_provider_error(
        self,
        provider: str,
        model_for_request: str,
        response: httpx.Response,
    ) -> Dict[str, Any]:
        status_code = response.status_code
        error_code = ""
        message = ""
        body: Any = None
        try:
            body = response.json()
        except Exception:
            body = response.text

        if provider == "openai" and isinstance(body, dict):
            err = body.get("error")
            err = err if isinstance(err, dict) else {}
            error_code = str(err.get("code") or err.get("type") or "")
            message = str(err.get("message") or "")
        elif provider == "anthropic" and isinstance(body, dict):
            err = body.get("error")
            err = err if isinstance(err, dict) else {}
            error_code = str(err.get("type") or body.get("type") or "")
            message = str(err.get("message") or "")
        elif provider == "google" and isinstance(body, dict):
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
            "error_user_message": self._friendly_error_message(provider, kind, model_for_request),
            "response_data": body,
        }

    def _build_payload_for_provider(
        self,
        payload: Dict[str, Any],
        target_provider: str,
        model_for_request: str,
    ) -> Dict[str, Any]:
        normalized = self._normalize_messages(payload)
        system_prompt = normalized.get("system_prompt") or ""
        messages = normalized.get("messages") or []
        knobs = self._extract_generation_knobs(payload)
        tool_specs = self._normalize_tool_specs(payload)
        tool_choice = self._map_tool_choice_for_provider(payload, target_provider)

        if target_provider == "openai":
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
                            "parameters": t.get("schema") or {"type": "object", "properties": {}},
                        },
                    }
                    for t in tool_specs
                ]
            if tool_choice is not None:
                out["tool_choice"] = tool_choice
            return out

        if target_provider == "anthropic":
            out = {
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
                        "input_schema": t.get("schema") or {"type": "object", "properties": {}},
                    }
                    for t in tool_specs
                ]
            if isinstance(tool_choice, dict):
                out["tool_choice"] = tool_choice
            return out

        if target_provider == "google":
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
                out["system_instruction"] = {"parts": [{"text": system_prompt}]}
            if tool_specs:
                out["tools"] = [
                    {
                        "functionDeclarations": [
                            {
                                "name": t["name"],
                                "description": t.get("description") or "",
                                "parameters": t.get("schema") or {"type": "object", "properties": {}},
                            }
                            for t in tool_specs
                        ]
                    }
                ]
            if isinstance(tool_choice, dict):
                out["toolConfig"] = tool_choice
            return out

        return payload

    def _extract_token_usage(
        self,
        provider: str,
        response_data: Any,
    ) -> Tuple[int, int]:
        """
        Best-effort extraction of input/output token usage from provider responses.

        Returns (input_tokens, output_tokens). Falls back to (0, 0) when unknown.
        """
        if not isinstance(response_data, dict):
            return 0, 0

        provider_key = (provider or "").strip().lower()

        # OpenAI style: {"usage": {"prompt_tokens": ..., "completion_tokens": ...}}
        usage = response_data.get("usage") or {}
        if isinstance(usage, dict):
            prompt = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
            completion = usage.get("completion_tokens") or usage.get("output_tokens") or 0
            if prompt or completion:
                return int(prompt or 0), int(completion or 0)

        # Anthropic style: {"usage": {"input_tokens": ..., "output_tokens": ...}} or top-level
        if provider_key == "anthropic":
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

        # Google Gemini style: {"usageMetadata": {"promptTokenCount": ..., "candidatesTokenCount": ...}}
        if provider_key == "google":
            meta = response_data.get("usageMetadata") or {}
            if isinstance(meta, dict):
                inp = meta.get("promptTokenCount") or 0
                out = meta.get("candidatesTokenCount") or meta.get("totalTokenCount") or 0
                if inp or out:
                    return int(inp or 0), int(out or 0)

        return 0, 0

    async def replay_snapshot(
        self,
        snapshot: Snapshot,
        new_model: Optional[str] = None,
        replay_provider: Optional[str] = None,
        new_system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        replay_overrides: Optional[Dict[str, Any]] = None,
        api_key: Optional[str] = None,
        project_id: Optional[int] = None,
        db: Optional[Session] = None,
        allow_environment_key: bool = True,
        prefer_environment_key: bool = False,
    ) -> Dict[str, Any]:
        """
        Execute a single replay with optional overrides.
        replay_overrides: optional dict merged into the request body (e.g. tools, extra params).
        """
        async with self.semaphore:
            # 1. Prepare Payload
            raw = snapshot.payload
            # Proxy-created snapshots store { "request": {...}, "response": {...} }; use request as body
            if isinstance(raw, dict) and "request" in raw and "response" in raw:
                payload = dict(raw["request"]) if isinstance(raw.get("request"), dict) else dict(raw)
            else:
                payload = dict(raw) if isinstance(raw, dict) else {}
            if temperature is not None:
                payload["temperature"] = temperature
            if max_tokens is not None:
                payload["max_tokens"] = max_tokens
            if top_p is not None:
                payload["top_p"] = top_p
            if isinstance(replay_overrides, dict) and replay_overrides:
                for k, v in replay_overrides.items():
                    if v is None:
                        payload.pop(k, None)  # null in overrides = remove key from request
                    else:
                        payload[k] = v

            if new_system_prompt:
                # Find system message and replace
                messages = payload.get("messages", [])
                for msg in messages:
                    if msg.get("role") == "system":
                        msg["content"] = new_system_prompt
                        break
                else:
                    # If no system prompt found, prepend it
                    messages.insert(0, {"role": "system", "content": new_system_prompt})
                payload["messages"] = messages

            target_provider = (replay_provider or snapshot.provider or "").strip().lower()
            if target_provider not in PROVIDER_URLS:
                return {
                    "snapshot_id": snapshot.id,
                    "original_model": snapshot.model,
                    "replay_model": new_model,
                    "replay_provider": target_provider or None,
                    "success": False,
                    "error": f"Unsupported replay provider '{target_provider or 'unknown'}'.",
                    "error_type": "provider_error",
                    "error_code": "unsupported_provider",
                    "error_user_message": "Selected replay provider is not supported.",
                }

            if replay_provider and replay_provider.strip().lower() != (snapshot.provider or "").strip().lower():
                # Cross-provider replay should use explicit target model id.
                if not (new_model and new_model.strip()):
                    return {
                        "snapshot_id": snapshot.id,
                        "original_model": snapshot.model,
                        "replay_model": new_model,
                        "replay_provider": target_provider,
                        "success": False,
                        "error": "Cross-provider replay requires a target model id (new_model).",
                        "error_type": "model_not_found",
                        "error_code": "missing_model",
                        "error_user_message": "Cross-provider replay requires an explicit target model id.",
                    }

            model_for_request = (
                (new_model or "").strip()
                or str(payload.get("model") or "").strip()
                or str(snapshot.model or "").strip()
            )
            if not model_for_request:
                return {
                    "snapshot_id": snapshot.id,
                    "original_model": snapshot.model,
                    "replay_model": "",
                    "replay_provider": target_provider,
                    "success": False,
                    "error": "Replay model is empty. Provide new_model.",
                    "error_type": "model_not_found",
                    "error_code": "missing_model",
                    "error_user_message": "Target model id is empty.",
                }

            payload = self._build_payload_for_provider(payload, target_provider, model_for_request)

            # 2. Build URL
            provider = target_provider
            base_url = PROVIDER_URLS.get(provider)
            model_for_url = payload.get("model") or model_for_request or snapshot.model or "unknown"
            if provider == "google":
                endpoint = f"/models/{model_for_url}:generateContent"
            elif provider == "anthropic":
                endpoint = "/messages"
            else:
                endpoint = "/chat/completions"
            target_url = f"{base_url}{endpoint}"

            # 3. Headers
            # API key precedence:
            # 1) Run-only key provided in validate payload
            # 2) Optional environment key first (platform model mode)
            # 3) Node-scoped key from Settings > API Keys (fallback to project default)
            # 4) Server environment key
            final_key = api_key
            if (
                prefer_environment_key
                and allow_environment_key
                and (not final_key or (isinstance(final_key, str) and not final_key.strip()))
            ):
                final_key = getattr(settings, f"{provider.upper()}_API_KEY", None)
            if (not final_key or (isinstance(final_key, str) and not final_key.strip())) and project_id and db:
                try:
                    from app.services.user_api_key_service import UserApiKeyService

                    user_api_key_service = UserApiKeyService(db)
                    final_key = user_api_key_service.get_user_api_key(
                        project_id,
                        provider,
                        getattr(snapshot, "agent_id", None),
                    )
                except Exception as key_error:
                    logger.warning(
                        "Failed to read project user API key for replay provider %s: %s",
                        provider,
                        str(key_error),
                    )
            if (
                allow_environment_key
                and (not final_key or (isinstance(final_key, str) and not final_key.strip()))
            ):
                final_key = getattr(settings, f"{provider.upper()}_API_KEY", None)
            if not final_key or (isinstance(final_key, str) and not final_key.strip()):
                return {
                    "snapshot_id": snapshot.id,
                    "original_model": snapshot.model,
                    "replay_model": model_for_request,
                    "replay_provider": provider,
                    "success": False,
                    "error": f"Replay requires an API key for provider '{provider}'. Set replay api_key in the request or {provider.upper()}_API_KEY in environment.",
                    "error_type": "auth",
                    "error_code": "missing_api_key",
                    "error_user_message": self._friendly_error_message(provider, "auth", model_for_request),
                }
            headers = {"Content-Type": "application/json"}
            if provider == "openai":
                headers["Authorization"] = f"Bearer {final_key}"
            elif provider == "anthropic":
                headers["x-api-key"] = final_key
                headers["anthropic-version"] = "2023-06-01"
            elif provider == "google":
                headers["x-goog-api-key"] = final_key

            # 4. Execute
            start_time = asyncio.get_event_loop().time()
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(target_url, headers=headers, json=payload)
                    duration_ms = (asyncio.get_event_loop().time() - start_time) * 1000
                    if response.status_code != 200:
                        normalized_error = self._extract_provider_error(
                            provider, model_for_request, response
                        )
                        return {
                            "snapshot_id": snapshot.id,
                            "original_model": snapshot.model,
                            "replay_model": model_for_request,
                            "replay_provider": provider,
                            "latency_ms": duration_ms,
                            "input_tokens": 0,
                            "output_tokens": 0,
                            "used_credits": 0,
                            "success": False,
                            **normalized_error,
                        }

                    try:
                        response_data: Any = response.json()
                    except Exception:
                        response_data = response.text

                    input_tokens, output_tokens = self._extract_token_usage(
                        provider, response_data if isinstance(response_data, dict) else {}
                    )
                    used_credits = calculate_credits(
                        provider=provider,
                        model=model_for_request,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    )

                    return {
                        "snapshot_id": snapshot.id,
                        "original_model": snapshot.model,
                        "replay_model": model_for_request,
                        "replay_provider": provider,
                        "status_code": response.status_code,
                        "response_data": response_data,
                        "latency_ms": duration_ms,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "used_credits": used_credits,
                        "success": response.status_code == 200,
                    }
            except Exception as e:
                logger.error(f"Replay failed for snapshot {snapshot.id}: {str(e)}")
                return {
                    "snapshot_id": snapshot.id,
                    "original_model": snapshot.model,
                    "replay_model": model_for_request,
                    "replay_provider": provider,
                    "success": False,
                    "error": str(e),
                    "error_type": "network",
                    "error_code": "",
                    "error_user_message": self._friendly_error_message(
                        provider, "network", model_for_request
                    ),
                }

    async def run_batch_replay(
        self,
        snapshots: List[Snapshot],
        new_model: Optional[str] = None,
        replay_provider: Optional[str] = None,
        new_system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        replay_overrides: Optional[Dict[str, Any]] = None,
        api_key: Optional[str] = None,
        rubric: Optional[EvaluationRubric] = None,
        judge_model: str = "gpt-4o-mini",
        project_id: Optional[int] = None,
        db: Optional[Session] = None,
        replay_run: Optional[ReplayRun] = None,
        allow_environment_key: bool = True,
        prefer_environment_key: bool = False,
        track_platform_credits: bool = False,
    ) -> List[Dict[str, Any]]:
        """Run multiple replays in parallel, evaluate, and apply signals."""
        results = await asyncio.gather(
            *[
                self.replay_snapshot(
                    s,
                    new_model=new_model,
                    replay_provider=replay_provider,
                    new_system_prompt=new_system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    top_p=top_p,
                    replay_overrides=replay_overrides,
                    api_key=api_key,
                    project_id=project_id,
                    db=db,
                    allow_environment_key=allow_environment_key,
                    prefer_environment_key=prefer_environment_key,
                )
                for s in snapshots
            ]
        )

        normalizer = DataNormalizer()

        if rubric:
            from app.services.judge_service import judge_service
            
            for res in results:
                if res["success"]:
                    # 1. Extract texts
                    snapshot = next(s for s in snapshots if s.id == res["snapshot_id"])
                    
                    # We need the original response text. 
                    # For MVP, we extract it from the snapshot metadata or associated APICall.
                    # Since Snapshot doesn't store response_text directly, we normalize the replayed response.
                    replayed_text = normalizer._extract_response_text(res["response_data"])
                    
                    # Original text extraction (from associated APICall)
                    from app.core.database import SessionLocal
                    with SessionLocal() as db:
                        from app.models.api_call import APICall
                        api_call = db.query(APICall).filter(APICall.chain_id == snapshot.trace_id).first()
                        original_text = api_call.response_text if api_call else "Original not found"

                    # 2. Judge
                    if original_text and replayed_text:
                        # Track judge call usage for subscription limits
                        # Get project owner from snapshot's trace
                        from app.core.database import SessionLocal
                        judge_db = db or SessionLocal()
                        user_api_key = None
                        try:
                            from app.models.project import Project
                            from app.models.trace import Trace
                            from app.services.billing_service import BillingService
                            from app.services.user_api_key_service import UserApiKeyService
                            
                            trace = judge_db.query(Trace).filter(Trace.id == snapshot.trace_id).first()
                            if trace:
                                project = judge_db.query(Project).filter(Project.id == (project_id or trace.project_id)).first()
                                if project:
                                    # Get user API key for Judge if available
                                    user_api_key_service = UserApiKeyService(judge_db)
                                    user_api_key = user_api_key_service.get_user_api_key(
                                        project.id,
                                        "openai",
                                        getattr(snapshot, "agent_id", None),
                                    )
                                    
                                    billing_service = BillingService(judge_db)
                                    # Check limit before calling judge
                                    is_allowed, warning = billing_service.increment_usage(
                                        project.owner_id, "judge_calls", 1
                                    )
                                    if not is_allowed:
                                        res["judge_evaluation"] = {
                                            "error": "Judge call limit exceeded. Please upgrade your plan.",
                                            "limit_warning": warning
                                        }
                                        continue
                        except Exception as e:
                            logger.warning(f"Failed to track judge call usage: {str(e)}")
                        
                        evaluation = await judge_service.evaluate_response(
                            original_output=original_text,
                            replayed_output=replayed_text,
                            rubric=rubric,
                            judge_model=judge_model,
                            user_api_key=user_api_key  # Use user API key if available
                        )
                        res["judge_evaluation"] = evaluation

        # SignalEngine integration, Worst marking, Alerts & HITL Reviews (when DB/session is provided)
        if db and project_id:
            # Persist hosted replay credit usage for this batch (best-effort; never break replay flow)
            try:
                _persist_replay_usage(db, project_id, results, track_platform_credits)
            except Exception as e:
                # Usage tracking is auxiliary; log and continue
                logger.warning(f"Failed to record hosted replay credit usage for project {project_id}: {str(e)}")

            signal_service = SignalDetectionService(db)
            review_service = ReviewService(db)
            review_items: List[Dict[str, Any]] = []
            for res in results:
                if not res.get("success"):
                    continue
                snapshot = next((s for s in snapshots if s.id == res["snapshot_id"]), None)
                if not snapshot:
                    continue

                try:
                    response_text = normalizer._extract_response_text(res.get("response_data"))
                except Exception:
                    response_text = ""

                signal_result = signal_service.detect_all_signals(
                    project_id=project_id,
                    response_text=response_text or "",
                    request_data=None,
                    response_data={
                        "latency_ms": res.get("latency_ms"),
                        "tokens_used": None,
                        "cost": None,
                    },
                    baseline_data=None,
                    snapshot_id=snapshot.id,
                )

                snapshot.signal_result = signal_result

                # When a snapshot transitions from non-worst to worst, persist flags and enqueue an Alert
                became_worst = bool(signal_result.get("is_worst")) and not bool(
                    getattr(snapshot, "is_worst", False)
                )
                if became_worst:
                    snapshot.is_worst = True
                    snapshot.worst_status = signal_result.get("worst_status") or "unreviewed"

                    # Create a worst-case alert scoped to Live View snapshots
                    try:
                        alert = Alert(
                            project_id=project_id,
                            alert_type="worst_case",
                            severity="high",
                            title="New worst case detected (Live View)",
                            message=(
                                f"Agent '{snapshot.agent_id}' has a new worst snapshot "
                                f"(status={snapshot.worst_status or 'unreviewed'})."
                            ),
                            alert_data={
                                "source": "replay",
                                "target": "live_view",
                                "project_id": project_id,
                                "agent_id": snapshot.agent_id,
                                "worst_status": snapshot.worst_status,
                                "snapshot_id": snapshot.id,
                            },
                        )
                        db.add(alert)
                    except Exception:
                        # Alerts should never break replay flow; log is handled by global logging config
                        pass

                res["signal_result"] = signal_result

                # Collect cases that require human review:
                # - Explicit SignalEngine verdict: needs_review / critical
                # - Or newly marked worst snapshot
                status = signal_result.get("status")
                if status in ("needs_review", "critical") or became_worst:
                    review_items.append(
                        {
                            "snapshot_id": snapshot.id,
                            "prompt": getattr(snapshot, "user_message", None) or "",
                            "response_after": response_text or "",
                            "signal_result": signal_result,
                        }
                    )

            # Auto-create a Review when any snapshots need human attention
            if review_items:
                try:
                    review_service.create_review_from_signal(
                        project_id=project_id,
                        origin="replay",
                        title="Replay results requiring review",
                        description=(
                            f"{len(review_items)} replayed snapshot(s) have signals "
                            "that require human review."
                        ),
                        items=review_items,
                    )
                except Exception:
                    # Review creation should never break replay flow; errors are logged globally
                    pass

            # Update ReplayRun aggregates if provided
            if replay_run is not None:
                safe_count = sum(
                    1
                    for r in results
                    if r.get("signal_result", {}).get("status") == "safe"
                )
                needs_review_count = sum(
                    1
                    for r in results
                    if r.get("signal_result", {}).get("status") == "needs_review"
                )
                critical_count = sum(
                    1
                    for r in results
                    if r.get("signal_result", {}).get("status") == "critical"
                )
                replay_run.safe_count = safe_count
                replay_run.needs_review_count = needs_review_count
                replay_run.critical_count = critical_count
                replay_run.snapshot_count = len(snapshots)
                replay_run.status = "completed"
                db.add(replay_run)

            db.commit()

        return results

# Global instance
replay_service = ReplayService()
