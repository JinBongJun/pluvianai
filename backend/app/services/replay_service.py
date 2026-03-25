import asyncio
import httpx
import json
from collections import defaultdict
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
from app.services.providers.capabilities import resolve_capabilities
from app.core.canonical import response_to_canonical_tool_calls
from app.utils.tool_events import normalize_tool_events
from app.utils.tool_calls import normalize_tool_name


def resolve_tool_context_injection_text(
    tool_context: Optional[Dict[str, Any]], snapshot_id: int
) -> str:
    """
    Resolve per-snapshot additional system context for Release Gate replay (dict from API).
    Appended to the system prompt so runs can include redacted or missing tool/doc material.
    """
    if not tool_context or not isinstance(tool_context, dict):
        return ""
    mode = str(tool_context.get("mode") or "recorded").strip().lower()
    if mode != "inject":
        return ""
    inject = tool_context.get("inject")
    if not isinstance(inject, dict):
        return ""
    scope = str(inject.get("scope") or "per_snapshot").strip().lower()
    global_text = inject.get("global_text")
    by_snapshot = inject.get("by_snapshot_id") or {}
    if not isinstance(by_snapshot, dict):
        by_snapshot = {}
    sid = str(snapshot_id)
    if scope == "global":
        if isinstance(global_text, str) and global_text.strip():
            return global_text.strip()
        return ""
    per_val = by_snapshot.get(sid)
    if isinstance(per_val, str) and per_val.strip():
        return per_val.strip()
    if isinstance(global_text, str) and global_text.strip():
        return global_text.strip()
    return ""


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
        # Provider adapters encapsulate request/response differences.
        # Shared normalization/classification stays in this service.
        from app.services.providers.openai_adapter import OpenAIProviderAdapter
        from app.services.providers.anthropic_adapter import AnthropicProviderAdapter
        from app.services.providers.google_adapter import GoogleProviderAdapter

        self._provider_adapters = {
            "openai": OpenAIProviderAdapter(
                classify_error=self._classify_error,
                friendly_error_message=self._friendly_error_message,
            ),
            "anthropic": AnthropicProviderAdapter(
                classify_error=self._classify_error,
                friendly_error_message=self._friendly_error_message,
            ),
            "google": GoogleProviderAdapter(
                classify_error=self._classify_error,
                friendly_error_message=self._friendly_error_message,
            ),
        }

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

    def _append_tool_context_to_payload(self, payload: Dict[str, Any], injection: str) -> None:
        text = (injection or "").strip()
        if not text:
            return
        block = (
            "\n\n---\n[Release Gate: additional system context — may include material not present in captured logs]\n"
            + text
            + "\n---\n"
        )
        messages = payload.get("messages")
        if isinstance(messages, list):
            for m in messages:
                if not isinstance(m, dict):
                    continue
                if str(m.get("role") or "").lower() == "system":
                    cur = self._content_to_text(m.get("content"))
                    m["content"] = cur + block
                    return
            messages.insert(0, {"role": "system", "content": block.strip()})
            payload["messages"] = messages
            return
        sys_key = payload.get("system")
        if isinstance(sys_key, str) and sys_key.strip():
            payload["system"] = sys_key + block
            return
        si = payload.get("systemInstruction")
        if isinstance(si, dict):
            parts = si.get("parts")
            if isinstance(parts, list) and parts:
                p0 = parts[0]
                if isinstance(p0, dict) and "text" in p0:
                    p0["text"] = str(p0.get("text") or "") + block
                    return
        prev = payload.get("system")
        payload["system"] = (str(prev) if prev is not None else "") + block

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

    def _build_simulated_tool_result_text(self, tool_name: str, tool_args: Dict[str, Any]) -> str:
        """
        Stage 2 alpha:
        We do not execute arbitrary external tools yet.
        Inject deterministic dry-run result text so the model can continue.
        """
        args_text = json.dumps(tool_args or {}, ensure_ascii=False)
        return (
            f"[tool_result simulated] tool={tool_name}; args={args_text}; "
            "execution_mode=dry_run; result=Tool execution is not connected yet."
        )

    def _tool_output_to_recorded_text(self, output: Any) -> str:
        """Serialize baseline tool output for replay injection."""
        if output is None:
            return ""
        if isinstance(output, str):
            return output
        try:
            return json.dumps(output, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(output)

    def _recorded_tool_result_lookups_from_snapshot(
        self, snapshot: Snapshot
    ) -> Tuple[Dict[str, str], Dict[str, List[str]]]:
        """
        Baseline tool_result text from ingest:
        - by_id: tool_call id -> text (strong match)
        - by_name_queue: normalized tool name -> FIFO queue of texts for rows without call_id
          (weak match: cross-provider / missing id)
        """
        payload = getattr(snapshot, "payload", None)
        if not isinstance(payload, dict):
            return {}, {}
        evs = normalize_tool_events(payload.get("tool_events"))
        if not evs:
            return {}, {}
        by_id: Dict[str, str] = {}
        by_name_queue: Dict[str, List[str]] = defaultdict(list)
        for ev in evs:
            if str(ev.get("kind") or "").strip().lower() != "tool_result":
                continue
            raw = self._tool_output_to_recorded_text(ev.get("output"))
            if not raw.strip():
                continue
            cid = ev.get("call_id")
            if cid is not None and str(cid).strip():
                by_id[str(cid).strip()] = raw
            else:
                n = normalize_tool_name(ev.get("name"))
                if n:
                    by_name_queue[n].append(raw)
        return by_id, {k: v for k, v in by_name_queue.items()}

    def _recorded_tool_result_map_from_snapshot(self, snapshot: Snapshot) -> Dict[str, str]:
        """Backward-compatible: call_id -> text only."""
        by_id, _ = self._recorded_tool_result_lookups_from_snapshot(snapshot)
        return by_id

    def _extract_text_and_tool_calls(
        self,
        response_data: Any,
        provider: str,
        normalizer: DataNormalizer,
    ) -> Tuple[str, List[Dict[str, Any]], bool]:
        text = ""
        try:
            text = normalizer._extract_response_text(response_data) or ""
        except Exception:
            text = ""
        tool_calls, _provider, id_conflict = response_to_canonical_tool_calls(
            response_data, provider_hint=provider
        )
        return text, tool_calls, bool(id_conflict)

    def _build_openai_followup_payload_native(
        self,
        *,
        model_for_request: str,
        system_prompt: str,
        conversation_messages: List[Dict[str, str]],
        tool_calls: List[Dict[str, Any]],
        tool_result_text_by_id: Dict[str, str],
        base_tool_defs: List[Dict[str, Any]],
        knobs_from_request: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Build an OpenAI-native follow-up payload:
        assistant(tool_calls) -> tool(tool_result) -> next completion.
        """
        native_messages: List[Dict[str, Any]] = []
        if system_prompt.strip():
            native_messages.append({"role": "system", "content": system_prompt.strip()})

        for m in conversation_messages:
            role = str(m.get("role") or "user").strip().lower()
            if role not in ("user", "assistant"):
                role = "user"
            native_messages.append({"role": role, "content": str(m.get("content") or "")})

        tool_call_entries: List[Dict[str, Any]] = []
        for idx, tc in enumerate(tool_calls, start=1):
            call_id = str(tc.get("id") or f"call_{idx}")
            name = str(tc.get("name") or "").strip() or "unknown_tool"
            args = tc.get("arguments") if isinstance(tc.get("arguments"), dict) else {}
            tool_call_entries.append(
                {
                    "id": call_id,
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": json.dumps(args, ensure_ascii=False),
                    },
                }
            )
        native_messages.append({"role": "assistant", "content": None, "tool_calls": tool_call_entries})

        for entry in tool_call_entries:
            call_id = str(entry.get("id") or "").strip()
            if not call_id:
                continue
            tool_result_text = tool_result_text_by_id.get(call_id) or ""
            native_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": tool_result_text,
                }
            )

        out: Dict[str, Any] = {
            "model": model_for_request,
            "messages": native_messages,
        }
        temperature = knobs_from_request.get("temperature")
        top_p = knobs_from_request.get("top_p")
        max_tokens = knobs_from_request.get("max_tokens")
        if temperature is not None:
            out["temperature"] = temperature
        if top_p is not None:
            out["top_p"] = top_p
        if max_tokens is not None:
            out["max_tokens"] = max_tokens
        if isinstance(base_tool_defs, list) and base_tool_defs:
            out["tools"] = base_tool_defs
            out["tool_choice"] = "auto"
        return out

    def _build_anthropic_followup_payload_native(
        self,
        *,
        model_for_request: str,
        system_prompt: str,
        conversation_messages: List[Dict[str, str]],
        tool_calls: List[Dict[str, Any]],
        tool_result_text_by_id: Dict[str, str],
        base_tool_defs: List[Dict[str, Any]],
        knobs_from_request: Dict[str, Any],
    ) -> Dict[str, Any]:
        native_messages: List[Dict[str, Any]] = []
        for m in conversation_messages:
            role = str(m.get("role") or "user").strip().lower()
            if role not in ("user", "assistant"):
                role = "user"
            native_messages.append({"role": role, "content": str(m.get("content") or "")})

        assistant_blocks: List[Dict[str, Any]] = []
        for idx, tc in enumerate(tool_calls, start=1):
            call_id = str(tc.get("id") or f"toolu_{idx}")
            name = str(tc.get("name") or "").strip() or "unknown_tool"
            args = tc.get("arguments") if isinstance(tc.get("arguments"), dict) else {}
            assistant_blocks.append(
                {
                    "type": "tool_use",
                    "id": call_id,
                    "name": name,
                    "input": args,
                }
            )
        native_messages.append({"role": "assistant", "content": assistant_blocks})

        tool_result_blocks: List[Dict[str, Any]] = []
        for block in assistant_blocks:
            call_id = str(block.get("id") or "").strip()
            if not call_id:
                continue
            tool_result_blocks.append(
                {
                    "type": "tool_result",
                    "tool_use_id": call_id,
                    "content": tool_result_text_by_id.get(call_id) or "",
                }
            )
        native_messages.append({"role": "user", "content": tool_result_blocks})

        out: Dict[str, Any] = {
            "model": model_for_request,
            "messages": native_messages,
            "max_tokens": int(knobs_from_request.get("max_tokens") or 1024),
        }
        if system_prompt.strip():
            out["system"] = system_prompt.strip()
        temperature = knobs_from_request.get("temperature")
        top_p = knobs_from_request.get("top_p")
        if temperature is not None:
            out["temperature"] = temperature
        if top_p is not None:
            out["top_p"] = top_p
        if isinstance(base_tool_defs, list) and base_tool_defs:
            out["tools"] = base_tool_defs
        return out

    def _build_google_followup_payload_native(
        self,
        *,
        model_for_request: str,
        system_prompt: str,
        conversation_messages: List[Dict[str, str]],
        tool_calls: List[Dict[str, Any]],
        tool_result_text_by_id: Dict[str, str],
        base_tool_defs: List[Dict[str, Any]],
        knobs_from_request: Dict[str, Any],
    ) -> Dict[str, Any]:
        adapter = self._provider_adapters.get("google")
        messages: List[Dict[str, Any]] = [
            {"role": str(m.get("role") or "user"), "content": str(m.get("content") or "")}
            for m in conversation_messages
        ]

        function_call_parts: List[Dict[str, Any]] = []
        function_response_parts: List[Dict[str, Any]] = []
        for idx, tc in enumerate(tool_calls, start=1):
            call_id = str(tc.get("id") or f"call_{idx}")
            name = str(tc.get("name") or "").strip() or "unknown_tool"
            args = tc.get("arguments") if isinstance(tc.get("arguments"), dict) else {}
            function_call_parts.append(
                {
                    "functionCall": {
                        "id": call_id,
                        "name": name,
                        "args": args,
                    }
                }
            )
            function_response_parts.append(
                {
                    "functionResponse": {
                        "name": name,
                        "response": {
                            "name": name,
                            "content": {
                                "result": tool_result_text_by_id.get(call_id) or "",
                            },
                        },
                    }
                }
            )
        messages.append({"role": "assistant", "content": function_call_parts})
        messages.append({"role": "user", "content": function_response_parts})

        if adapter is not None:
            return adapter.build_payload(
                system_prompt=system_prompt,
                messages=messages,
                knobs={
                    "temperature": knobs_from_request.get("temperature"),
                    "top_p": knobs_from_request.get("top_p"),
                    "max_tokens": knobs_from_request.get("max_tokens"),
                },
                tool_specs=self._normalize_tool_specs({"tools": base_tool_defs}),
                tool_choice={"functionCallingConfig": {"mode": "AUTO"}} if base_tool_defs else None,
                model_for_request=model_for_request,
                system_instruction_field=resolve_capabilities("google", model_for_request).get(
                    "google_system_instruction_field", "system_instruction"
                ),
            )

        return {
            "model": model_for_request,
            "messages": messages,
        }

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
        provider_key = (provider or "").strip().lower()
        adapter = self._provider_adapters.get(provider_key)
        if adapter is not None:
            return adapter.extract_provider_error(
                model_for_request=model_for_request, response=response
            )

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

        capabilities = resolve_capabilities(target_provider, model_for_request)

        if not bool(capabilities.get("supports_tools", True)):
            tool_specs = []
            tool_choice = None

        if not bool(capabilities.get("supports_system_prompt", True)):
            system_prompt = ""

        adapter = self._provider_adapters.get(target_provider)
        if adapter is not None:
            if target_provider == "google":
                return adapter.build_payload(
                    system_prompt=system_prompt,
                    messages=messages,
                    knobs=knobs,
                    tool_specs=tool_specs,
                    tool_choice=tool_choice,
                    model_for_request=model_for_request,
                    system_instruction_field=capabilities.get(
                        "google_system_instruction_field", "system_instruction"
                    ),
                )
            return adapter.build_payload(
                system_prompt=system_prompt,
                messages=messages,
                knobs=knobs,
                tool_specs=tool_specs,
                tool_choice=tool_choice,
                model_for_request=model_for_request,
            )

        return payload

    def _google_payload_fallback_variants(
        self, payload: Dict[str, Any]
    ) -> List[Tuple[str, Dict[str, Any]]]:
        adapter = self._provider_adapters.get("google")
        if adapter is None:
            return []
        return adapter.payload_fallback_variants(payload)

    def _extract_token_usage(
        self,
        provider: str,
        response_data: Any,
    ) -> Tuple[int, int]:
        """
        Best-effort extraction of input/output token usage from provider responses.

        Returns (input_tokens, output_tokens). Falls back to (0, 0) when unknown.
        """
        provider_key = (provider or "").strip().lower()
        adapter = self._provider_adapters.get(provider_key)
        if adapter is not None:
            return adapter.extract_token_usage(response_data)

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
        tool_context: Optional[Dict[str, Any]] = None,
        api_key: Optional[str] = None,
        project_id: Optional[int] = None,
        db: Optional[Session] = None,
        allow_environment_key: bool = True,
        prefer_environment_key: bool = False,
    ) -> Dict[str, Any]:
        """
        Execute a single replay with optional overrides.
        replay_overrides: optional dict merged into the request body (e.g. tools, extra params).
        tool_context: optional Release Gate dict (mode/inject) to append additional system context to system prompt.
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

            injection = resolve_tool_context_injection_text(tool_context, snapshot.id)
            if injection:
                self._append_tool_context_to_payload(payload, injection)

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

            # Keep a normalized seed conversation for tool-loop continuation.
            normalized_seed = self._normalize_messages(payload)
            seed_system_prompt = normalized_seed.get("system_prompt") or ""
            seed_messages = normalized_seed.get("messages") or []
            # Preserve original tool definitions for follow-up rounds.
            base_tool_defs = payload.get("tools") if isinstance(payload.get("tools"), list) else []

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
                        fallback_attempts: List[str] = []
                        if provider == "google" and normalized_error.get("error_type") == "payload_schema":
                            for stage, fallback_payload in self._google_payload_fallback_variants(payload):
                                fallback_attempts.append(stage)
                                try:
                                    retry_response = await client.post(
                                        target_url, headers=headers, json=fallback_payload
                                    )
                                except Exception:
                                    continue
                                if retry_response.status_code != 200:
                                    normalized_error = self._extract_provider_error(
                                        provider, model_for_request, retry_response
                                    )
                                    continue

                                try:
                                    response_data = retry_response.json()
                                except Exception:
                                    response_data = {"text": retry_response.text}

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
                                    "status_code": retry_response.status_code,
                                    "response_data": response_data,
                                    "latency_ms": duration_ms,
                                    "input_tokens": input_tokens,
                                    "output_tokens": output_tokens,
                                    "used_credits": used_credits,
                                    "success": True,
                                    "request_fallback_stage": stage,
                                    "request_fallback_attempts": fallback_attempts,
                                }
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
                            "request_fallback_attempts": fallback_attempts,
                            **normalized_error,
                        }

                    try:
                        response_data: Any = response.json()
                    except Exception:
                        # Preserve raw body in a dict so downstream normalizers can extract preview text.
                        response_data = {"text": response.text}

                    input_tokens, output_tokens = self._extract_token_usage(
                        provider, response_data if isinstance(response_data, dict) else {}
                    )
                    used_credits = calculate_credits(
                        provider=provider,
                        model=model_for_request,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    )

                    # Stage 2 alpha tool loop:
                    # if provider returns tool calls, append simulated tool_result messages
                    # and call the provider again up to max rounds.
                    normalizer = DataNormalizer()
                    loop_rounds = 0
                    loop_events: List[Dict[str, Any]] = []
                    loop_status = "not_needed"
                    current_response_data = response_data
                    total_input_tokens = int(input_tokens or 0)
                    total_output_tokens = int(output_tokens or 0)
                    total_used_credits = int(used_credits or 0)
                    max_tool_rounds_raw = (
                        replay_overrides.get("max_tool_rounds")
                        if isinstance(replay_overrides, dict)
                        else None
                    )
                    try:
                        max_tool_rounds = int(max_tool_rounds_raw) if max_tool_rounds_raw is not None else 4
                    except Exception:
                        max_tool_rounds = 4
                    max_tool_rounds = max(1, min(max_tool_rounds, 8))

                    # Keep an evolving normalized conversation for follow-up rounds.
                    conversation_messages: List[Dict[str, str]] = [
                        {"role": str(m.get("role") or "user"), "content": str(m.get("content") or "")}
                        for m in seed_messages
                        if isinstance(m, dict) and str(m.get("content") or "").strip()
                    ]
                    # Ensure at least one user turn exists.
                    if not conversation_messages:
                        fallback_user = str(snapshot.user_message or "").strip()
                        if fallback_user:
                            conversation_messages.append({"role": "user", "content": fallback_user})

                    recorded_by_id, recorded_name_queues = self._recorded_tool_result_lookups_from_snapshot(
                        snapshot
                    )

                    for round_index in range(1, max_tool_rounds + 1):
                        assistant_text, tool_calls, id_conflict = self._extract_text_and_tool_calls(
                            current_response_data, provider, normalizer
                        )
                        if id_conflict:
                            loop_status = "id_conflict"
                            loop_events.append(
                                {
                                    "round": round_index,
                                    "status": "stopped",
                                    "reason": "tool_call_id_conflict",
                                }
                            )
                            break
                        if not tool_calls:
                            if round_index == 1:
                                loop_status = "not_needed"
                            else:
                                loop_status = "completed"
                            break

                        loop_rounds = round_index
                        loop_status = "running"
                        followup_mode = "text_fallback"
                        tool_names = [str(tc.get("name") or "") for tc in tool_calls]
                        tool_event_rows: List[Dict[str, Any]] = []
                        tool_result_text_by_id: Dict[str, str] = {}
                        for tc in tool_calls:
                            tool_name = str(tc.get("name") or "").strip() or "unknown_tool"
                            tool_args = tc.get("arguments") if isinstance(tc.get("arguments"), dict) else {}
                            call_id = str(tc.get("id") or "").strip()
                            if not call_id:
                                call_id = f"call_{round_index}_{tool_name}"
                            tc["id"] = call_id
                            recorded_raw = recorded_by_id.get(call_id)
                            match_tier: Optional[str] = "call_id" if recorded_raw and str(recorded_raw).strip() else None
                            if not match_tier:
                                n = normalize_tool_name(tool_name)
                                if n and n in recorded_name_queues and recorded_name_queues[n]:
                                    recorded_raw = recorded_name_queues[n].pop(0)
                                    match_tier = "name_order"
                            if recorded_raw is not None and str(recorded_raw).strip():
                                result_text = str(recorded_raw)
                                row_status = "recorded"
                                exec_src = "recorded"
                                tool_result_src = "baseline_snapshot"
                            else:
                                result_text = self._build_simulated_tool_result_text(tool_name, tool_args)
                                row_status = "simulated"
                                exec_src = "simulated"
                                tool_result_src = "dry_run"
                                match_tier = None
                            tool_result_text_by_id[call_id] = result_text
                            tool_event_rows.append(
                                {
                                    "name": tool_name,
                                    "call_id": call_id,
                                    "status": row_status,
                                    "execution_source": exec_src,
                                    "tool_result_source": tool_result_src,
                                    "match_tier": match_tier,
                                    "arguments_preview": json.dumps(tool_args, ensure_ascii=False),
                                    "result_preview": result_text,
                                }
                            )
                        loop_events.append(
                            {
                                "round": round_index,
                                "status": "tool_calls_detected",
                                "tool_count": len(tool_calls),
                                "tools": tool_names,
                                "tool_rows": tool_event_rows,
                                "mode": followup_mode,
                            }
                        )

                        if assistant_text.strip():
                            conversation_messages.append({"role": "assistant", "content": assistant_text.strip()})

                        for tc in tool_calls:
                            tool_name_fb = str(tc.get("name") or "").strip() or "unknown_tool"
                            call_id = str(tc.get("id") or "").strip()
                            if not call_id:
                                call_id = f"call_{round_index}_{tool_name_fb}"
                            result_text = tool_result_text_by_id.get(call_id) or ""
                            conversation_messages.append(
                                {
                                    "role": "user",
                                    "content": result_text,
                                }
                            )

                        if provider == "openai":
                            followup_mode = "openai_native_tool_result"
                            followup_payload = self._build_openai_followup_payload_native(
                                model_for_request=model_for_request,
                                system_prompt=seed_system_prompt,
                                conversation_messages=conversation_messages,
                                tool_calls=tool_calls,
                                tool_result_text_by_id=tool_result_text_by_id,
                                base_tool_defs=base_tool_defs,
                                knobs_from_request=payload,
                            )
                        elif provider == "anthropic":
                            followup_mode = "anthropic_native_tool_result"
                            followup_payload = self._build_anthropic_followup_payload_native(
                                model_for_request=model_for_request,
                                system_prompt=seed_system_prompt,
                                conversation_messages=conversation_messages,
                                tool_calls=tool_calls,
                                tool_result_text_by_id=tool_result_text_by_id,
                                base_tool_defs=base_tool_defs,
                                knobs_from_request=payload,
                            )
                        elif provider == "google":
                            followup_mode = "google_native_tool_result"
                            followup_payload = self._build_google_followup_payload_native(
                                model_for_request=model_for_request,
                                system_prompt=seed_system_prompt,
                                conversation_messages=conversation_messages,
                                tool_calls=tool_calls,
                                tool_result_text_by_id=tool_result_text_by_id,
                                base_tool_defs=base_tool_defs,
                                knobs_from_request=payload,
                            )
                        else:
                            followup_payload = {
                                "model": model_for_request,
                                "messages": conversation_messages,
                            }
                            if seed_system_prompt:
                                followup_payload["system"] = seed_system_prompt
                            if isinstance(base_tool_defs, list) and base_tool_defs:
                                followup_payload["tools"] = base_tool_defs
                                followup_payload["tool_choice"] = "auto"

                            for knob_key in ("temperature", "top_p", "max_tokens"):
                                knob_val = payload.get(knob_key)
                                if knob_val is not None:
                                    followup_payload[knob_key] = knob_val

                            followup_payload = self._build_payload_for_provider(
                                followup_payload, provider, model_for_request
                            )
                        if loop_events and isinstance(loop_events[-1], dict):
                            loop_events[-1]["mode"] = followup_mode
                        try:
                            followup_resp = await client.post(
                                target_url, headers=headers, json=followup_payload
                            )
                        except Exception as loop_exc:
                            loop_status = "network_error"
                            loop_events.append(
                                {
                                    "round": round_index,
                                    "status": "failed",
                                    "reason": "followup_request_error",
                                    "message": str(loop_exc),
                                    "mode": followup_mode,
                                }
                            )
                            break

                        if followup_resp.status_code != 200:
                            loop_status = "provider_error"
                            loop_events.append(
                                {
                                    "round": round_index,
                                    "status": "failed",
                                    "reason": "followup_non_200",
                                    "status_code": int(followup_resp.status_code),
                                    "mode": followup_mode,
                                }
                            )
                            break

                        try:
                            current_response_data = followup_resp.json()
                        except Exception:
                            current_response_data = {"text": followup_resp.text}

                        loop_input_tokens, loop_output_tokens = self._extract_token_usage(
                            provider,
                            current_response_data if isinstance(current_response_data, dict) else {},
                        )
                        total_input_tokens += int(loop_input_tokens or 0)
                        total_output_tokens += int(loop_output_tokens or 0)
                        total_used_credits += int(
                            calculate_credits(
                                provider=provider,
                                model=model_for_request,
                                input_tokens=loop_input_tokens,
                                output_tokens=loop_output_tokens,
                            )
                            or 0
                        )

                        next_text, next_tool_calls, _ = self._extract_text_and_tool_calls(
                            current_response_data, provider, normalizer
                        )
                        if next_text.strip():
                            # Keep final assistant text available to subsequent rounds.
                            conversation_messages.append({"role": "assistant", "content": next_text.strip()})
                        if not next_tool_calls:
                            loop_status = "completed"
                            break
                    else:
                        loop_status = "max_rounds_exceeded"

                    response_data = current_response_data
                    input_tokens = total_input_tokens
                    output_tokens = total_output_tokens
                    used_credits = total_used_credits

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
                        "tool_loop_status": loop_status,
                        "tool_loop_rounds": loop_rounds,
                        "tool_loop_events": loop_events,
                        "max_tool_rounds": max_tool_rounds,
                        "request_fallback_stage": None,
                        "request_fallback_attempts": [],
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
        replay_overrides_by_snapshot_id: Optional[Dict[str, Dict[str, Any]]] = None,
        tool_context: Optional[Dict[str, Any]] = None,
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
        by_sid = replay_overrides_by_snapshot_id or {}

        def _merged_overrides_for(snapshot: Snapshot) -> Optional[Dict[str, Any]]:
            base = dict(replay_overrides or {})
            sid = str(snapshot.id)
            extra = by_sid.get(sid)
            if isinstance(extra, dict) and extra:
                base.update(extra)
            return base if base else None

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
                    replay_overrides=_merged_overrides_for(s),
                    tool_context=tool_context,
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
                                    # Check hosted evaluation credit soft cap before calling judge
                                    is_allowed, warning = billing_service.increment_usage(
                                        project.owner_id, "judge_calls", 1
                                    )
                                    if not is_allowed:
                                        res["judge_evaluation"] = {
                                            "error": "Hosted replay evaluation limit reached for your current plan. Switch to your own provider key or upgrade your plan to keep running Release Gate.",
                                            "limit_warning": warning,
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
