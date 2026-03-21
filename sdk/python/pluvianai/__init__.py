"""
PluvianAI Python SDK - Zero-config monitoring for LLM APIs
"""
import os
import json
import time
import httpx
import threading
from queue import Queue, Empty
from typing import Optional, Dict, Any, Callable, List
from functools import wraps
from contextlib import contextmanager


def _deep_json_copy(obj: Any) -> Any:
    try:
        return json.loads(json.dumps(obj, default=str))
    except Exception:
        return {"_pluvianai_unserializable": True}


class PluvianAI:
    """PluvianAI SDK for automatic LLM API monitoring"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        project_id: Optional[int] = None,
        api_url: Optional[str] = None,
        agent_name: Optional[str] = None,
        enabled: bool = True,
        proxy_timeout: float = 30.0,
        firewall_timeout: float = 1.0,
        pii_timeout: float = 0.1,
        circuit_breaker: Optional[Dict[str, Any]] = None,
        health_check_interval: float = 30.0,
        flush_at: Optional[int] = None,
        flush_interval: Optional[float] = None,
        log_request_bodies: Optional[bool] = None,
        log_response_bodies: Optional[bool] = None,
        log_tool_event_payloads: Optional[bool] = None,
        max_request_body_bytes: Optional[int] = None,
        max_response_body_bytes: Optional[int] = None,
    ):
        """
        Initialize PluvianAI SDK

        Args:
            api_key: PluvianAI API key (defaults to PLUVIANAI_API_KEY env var)
            project_id: Project ID (defaults to PLUVIANAI_PROJECT_ID env var)
            api_url: PluvianAI API URL (defaults to PLUVIANAI_API_URL env var)
            agent_name: Agent name for tracking (defaults to PLUVIANAI_AGENT_NAME env var)
            enabled: Whether monitoring is enabled (defaults to True)
            proxy_timeout: Proxy timeout in seconds (default: 30.0)
            firewall_timeout: Firewall timeout in seconds (default: 1.0)
            pii_timeout: PII sanitization timeout in seconds (default: 0.1)
            circuit_breaker: Circuit breaker config (default: failure_threshold=5, recovery_time=30)
            health_check_interval: Health check interval in seconds (default: 30.0)
            flush_at: Max events to batch before sending (default: 10, env PLUVIANAI_FLUSH_AT)
            flush_interval: Max seconds to wait before sending a batch (default: 5.0, env PLUVIANAI_FLUSH_INTERVAL)
            log_request_bodies: Send full ``messages`` text to ingest (default True; env PLUVIANAI_LOG_REQUEST_BODIES or PLUVIANAI_LOG_USER_CONTENT)
            log_response_bodies: Send full ``choices[].message.content`` to ingest (default True; env PLUVIANAI_LOG_RESPONSE_BODIES or PLUVIANAI_LOG_USER_CONTENT)
            log_tool_event_payloads: Send tool_events input/output (default True; env PLUVIANAI_LOG_TOOL_PAYLOADS or PLUVIANAI_LOG_USER_CONTENT)
            max_request_body_bytes: If JSON-serialized request_data exceeds this (UTF-8 bytes), replace with a stub (default 524288; env PLUVIANAI_MAX_REQUEST_BODY_BYTES)
            max_response_body_bytes: Same for response_data (default 524288; env PLUVIANAI_MAX_RESPONSE_BODY_BYTES)
        """
        self.api_key = api_key or os.getenv("PLUVIANAI_API_KEY")
        self.project_id = project_id or os.getenv("PLUVIANAI_PROJECT_ID")
        self.api_url = api_url or os.getenv("PLUVIANAI_API_URL", "https://api.pluvianai.com")
        self.agent_name = agent_name or os.getenv("PLUVIANAI_AGENT_NAME")
        self.enabled = enabled and self.api_key and self.project_id

        # Timeout configuration
        self.proxy_timeout = proxy_timeout
        self.firewall_timeout = firewall_timeout
        self.pii_timeout = pii_timeout
        self.health_check_interval = health_check_interval

        # Batching: queue + background send (Langfuse-style)
        _flush_at = flush_at
        if _flush_at is None and os.getenv("PLUVIANAI_FLUSH_AT"):
            try:
                _flush_at = int(os.getenv("PLUVIANAI_FLUSH_AT", "10"))
            except ValueError:
                _flush_at = 10
        self._flush_at = _flush_at if _flush_at is not None else 10
        _flush_interval = flush_interval
        if _flush_interval is None and os.getenv("PLUVIANAI_FLUSH_INTERVAL"):
            try:
                _flush_interval = float(os.getenv("PLUVIANAI_FLUSH_INTERVAL", "5.0"))
            except ValueError:
                _flush_interval = 5.0
        self._flush_interval = _flush_interval if _flush_interval is not None else 5.0
        self._queue: Queue = Queue()
        self._shutdown = False
        self._flush_event = threading.Event()
        self._worker = threading.Thread(target=self._worker_loop, daemon=True)
        if self.enabled:
            self._worker.start()

        self.log_request_bodies = self._resolve_log_flag(
            log_request_bodies, "PLUVIANAI_LOG_REQUEST_BODIES", "PLUVIANAI_LOG_USER_CONTENT", True
        )
        self.log_response_bodies = self._resolve_log_flag(
            log_response_bodies, "PLUVIANAI_LOG_RESPONSE_BODIES", "PLUVIANAI_LOG_USER_CONTENT", True
        )
        self.log_tool_event_payloads = self._resolve_log_flag(
            log_tool_event_payloads, "PLUVIANAI_LOG_TOOL_PAYLOADS", "PLUVIANAI_LOG_USER_CONTENT", True
        )
        _mrb = max_request_body_bytes
        if _mrb is None:
            try:
                _mrb = int(os.getenv("PLUVIANAI_MAX_REQUEST_BODY_BYTES", "524288"))
            except ValueError:
                _mrb = 524288
        self.max_request_body_bytes = max(4096, _mrb)
        _mrs = max_response_body_bytes
        if _mrs is None:
            try:
                _mrs = int(os.getenv("PLUVIANAI_MAX_RESPONSE_BODY_BYTES", "524288"))
            except ValueError:
                _mrs = 524288
        self.max_response_body_bytes = max(4096, _mrs)

        # Circuit Breaker configuration
        self.circuit_breaker_config = circuit_breaker or {
            "failure_threshold": 5,
            "recovery_time_seconds": 30,
            "half_open_max_calls": 3,
        }
        self._circuit_state = "closed"  # closed, open, half-open
        self._circuit_failures = 0
        self._circuit_opened_at = None

        self._patched = False
        self._original_functions = {}

        # Thread-local storage for chain_id and agent_name context
        self._local = threading.local()

        # Start health check monitoring
        if self.enabled:
            self._start_health_check()

    def init(self):
        """
        Initialize and patch OpenAI SDK automatically

        This method automatically patches the OpenAI Python SDK to capture
        all API calls without requiring code changes.

        Example:
            import pluvianai
            pluvianai.init()

            # Now all OpenAI calls are automatically monitored
            from openai import OpenAI
            client = OpenAI()
            response = client.chat.completions.create(...)
        """
        if not self.enabled:
            print("PluvianAI: Monitoring disabled (missing API key or project ID)")
            return

        if self._patched:
            print("PluvianAI: Already initialized")
            return

        try:
            self._patch_openai()
            self._patched = True
            print(f"PluvianAI: Successfully initialized for project {self.project_id}")
        except Exception as e:
            print(f"PluvianAI: Failed to initialize: {e}")

    def _patch_openai(self):
        """Patch OpenAI SDK to capture API calls"""
        try:
            import openai
        except ImportError:
            print("PluvianAI: OpenAI SDK not found. Install with: pip install openai")
            return

        pluvian_instance = self  # Capture self for closures

        # Patch ChatCompletion.create (OpenAI v0.x)
        if hasattr(openai, "ChatCompletion") and hasattr(openai.ChatCompletion, "create"):
            original_create = openai.ChatCompletion.create

            def patched_create(*args, **kwargs):
                return pluvian_instance._capture_call(original_create, *args, **kwargs)

            # Copy attributes manually to avoid __name__ issues
            patched_create.__doc__ = getattr(original_create, '__doc__', None)
            openai.ChatCompletion.create = patched_create
            self._original_functions["ChatCompletion.create"] = original_create

        # Patch OpenAI client (v1.0+)
        if hasattr(openai, "OpenAI"):
            # Store original class methods
            original_init = openai.OpenAI.__init__

            # Patch at class level for chat.completions.create
            def patched_init(self_instance, *args, **kwargs):
                original_init(self_instance, *args, **kwargs)
                # Patch the chat.completions.create method on this instance
                if hasattr(self_instance, "chat") and hasattr(self_instance.chat, "completions"):
                    original_chat_create = self_instance.chat.completions.create

                    def patched_chat_create(*call_args, **call_kwargs):
                        return pluvian_instance._capture_call(original_chat_create, *call_args, **call_kwargs)

                    # Copy attributes manually
                    patched_chat_create.__doc__ = getattr(original_chat_create, '__doc__', None)
                    self_instance.chat.completions.create = patched_chat_create
                    pluvian_instance._original_functions[f"{id(self_instance)}.chat.completions.create"] = original_chat_create

            openai.OpenAI.__init__ = patched_init
            self._original_functions["OpenAI.__init__"] = original_init

    def _capture_call(self, original_func: Callable, *args, **kwargs):
        """Capture and log an API call"""
        start_time = time.time()

        # Build request_data from kwargs (OpenAI API parameters)
        request_data = {}
        try:
            # Extract common OpenAI parameters
            if 'model' in kwargs:
                request_data['model'] = kwargs['model']
            if 'messages' in kwargs:
                request_data['messages'] = kwargs['messages']
            if 'max_tokens' in kwargs:
                request_data['max_tokens'] = kwargs['max_tokens']
            if 'temperature' in kwargs:
                request_data['temperature'] = kwargs['temperature']
            if 'stream' in kwargs:
                request_data['stream'] = kwargs['stream']

            # If no specific params found, try to serialize kwargs
            if not request_data:
                # Filter out non-serializable items
                for k, v in kwargs.items():
                    try:
                        json.dumps(v)
                        request_data[k] = v
                    except (TypeError, ValueError):
                        request_data[k] = str(v)
        except Exception:
            request_data = {"raw_kwargs": str(kwargs)}

        try:
            # Call original function
            response = original_func(*args, **kwargs)

            # Calculate latency
            latency_ms = (time.time() - start_time) * 1000

            # Extract response data
            response_data = {}
            if hasattr(response, "model_dump"):
                response_data = response.model_dump()
            elif hasattr(response, "dict"):
                response_data = response.dict()
            elif hasattr(response, "__dict__"):
                response_data = response.__dict__

            # Send to PluvianAI API (async, non-blocking)
            self._send_to_api(request_data, response_data, latency_ms, 200)

            return response

        except Exception as e:
            # Calculate latency even on error
            latency_ms = (time.time() - start_time) * 1000

            # Send error to PluvianAI API
            error_data = {
                "error": str(e),
                "error_type": type(e).__name__,
            }
            self._send_to_api(request_data, error_data, latency_ms, 500)

            # Re-raise the exception
            raise

    def _get_chain_id(self) -> Optional[str]:
        """Get chain_id from thread-local storage"""
        return getattr(self._local, 'chain_id', None)

    def _get_agent_name(self) -> Optional[str]:
        """Get agent_name from thread-local storage or instance default"""
        return getattr(self._local, 'agent_name', self.agent_name)

    @contextmanager
    def chain(self, chain_id: str, agent_name: Optional[str] = None):
        """
        Context manager to set chain_id and agent_name for a chain of API calls

        Example:
            with pluvianai.chain("user-query-123", agent_name="data-collector"):
                response1 = openai.chat.completions.create(...)
                response2 = openai.chat.completions.create(...)
            # Both calls will have chain_id="user-query-123"
        """
        old_chain_id = getattr(self._local, 'chain_id', None)
        old_agent_name = getattr(self._local, 'agent_name', None)

        self._local.chain_id = chain_id
        if agent_name:
            self._local.agent_name = agent_name

        try:
            yield
        finally:
            if old_chain_id is not None:
                self._local.chain_id = old_chain_id
            else:
                delattr(self._local, 'chain_id')

            if old_agent_name is not None:
                self._local.agent_name = old_agent_name
            elif hasattr(self._local, 'agent_name'):
                delattr(self._local, 'agent_name')

    @staticmethod
    def _resolve_log_flag(
        param: Optional[bool],
        env_specific: str,
        env_global: str,
        default: bool = True,
    ) -> bool:
        if param is not None:
            return param
        v = os.getenv(env_specific)
        if v is not None and str(v).strip() != "":
            return str(v).strip().lower() not in ("0", "false", "no", "off")
        v2 = os.getenv(env_global)
        if v2 is not None and str(v2).strip() != "":
            return str(v2).strip().lower() not in ("0", "false", "no", "off")
        return default

    def _strip_request_message_bodies(self, rd: Dict[str, Any]) -> Dict[str, Any]:
        msgs = rd.get("messages")
        if isinstance(msgs, list):
            out = []
            for m in msgs:
                if isinstance(m, dict):
                    nm = dict(m)
                    clen = len(str(nm.get("content", ""))) if nm.get("content") is not None else 0
                    nm["content"] = "[omitted]"
                    nm["_pluvianai_content_length"] = clen
                    out.append(nm)
                else:
                    out.append(m)
            rd["messages"] = out
            rd["_pluvianai_message_bodies_omitted"] = True
        return rd

    def _strip_response_message_bodies(self, rs: Dict[str, Any]) -> Dict[str, Any]:
        ch = rs.get("choices")
        if isinstance(ch, list):
            out = []
            for c in ch:
                if isinstance(c, dict) and isinstance(c.get("message"), dict):
                    msg = dict(c["message"])
                    clen = len(str(msg.get("content", "")))
                    msg["content"] = "[omitted]"
                    msg["_pluvianai_content_length"] = clen
                    out.append({**c, "message": msg})
                else:
                    out.append(c)
            rs["choices"] = out
            rs["_pluvianai_response_bodies_omitted"] = True
        return rs

    def _strip_tool_event_payloads(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for ev in events:
            if not isinstance(ev, dict):
                continue
            e = dict(ev)
            if "input" in e:
                e["input"] = "[omitted]"
                e["_pluvianai_input_omitted"] = True
            if "output" in e:
                e["output"] = "[omitted]"
                e["_pluvianai_output_omitted"] = True
            out.append(e)
        return out

    def _truncate_if_needed(self, obj: Dict[str, Any], max_bytes: int, label: str) -> Dict[str, Any]:
        try:
            s = json.dumps(obj, default=str)
        except Exception:
            return obj
        b = len(s.encode("utf-8"))
        if b <= max_bytes:
            return obj
        return {
            "_pluvianai_truncated": True,
            "_pluvianai_approx_bytes": b,
            "_pluvianai_max_bytes": max_bytes,
            "_pluvianai_label": label,
            "model": obj.get("model") if isinstance(obj, dict) else None,
        }

    def _sanitize_for_ingest(
        self,
        request_data: Dict[str, Any],
        response_data: Dict[str, Any],
        tool_events: Optional[List[Dict[str, Any]]],
    ):
        rd: Dict[str, Any] = _deep_json_copy(request_data or {})
        rs: Dict[str, Any] = _deep_json_copy(response_data or {})
        if not self.log_request_bodies:
            rd = self._strip_request_message_bodies(rd)
        if not self.log_response_bodies:
            rs = self._strip_response_message_bodies(rs)
        te_out: Optional[List[Dict[str, Any]]] = None
        if tool_events is not None:
            te_out = _deep_json_copy(tool_events)
            if not self.log_tool_event_payloads:
                te_out = self._strip_tool_event_payloads(te_out)
        rd = self._truncate_if_needed(rd, self.max_request_body_bytes, "request_data")
        rs = self._truncate_if_needed(rs, self.max_response_body_bytes, "response_data")
        return rd, rs, te_out

    def _send_to_api(
        self,
        request_data: Dict[str, Any],
        response_data: Dict[str, Any],
        latency_ms: float,
        status_code: int,
        tool_events: Optional[List[Dict[str, Any]]] = None,
    ):
        """Enqueue API call data for background send (non-blocking)."""
        if not self.enabled:
            return
        try:
            chain_id = self._get_chain_id()
            agent_name = self._get_agent_name()
            rd, rs, te = self._sanitize_for_ingest(request_data, response_data, tool_events)
            payload = {
                "project_id": int(self.project_id),
                "request_data": rd,
                "response_data": rs,
                "latency_ms": latency_ms,
                "status_code": status_code,
                "agent_name": agent_name,
            }
            if chain_id:
                payload["chain_id"] = chain_id
            if tool_events is not None:
                payload["tool_events"] = te
            if not self._check_circuit_breaker():
                return
            self._queue.put_nowait(payload)
            if self._queue.qsize() >= self._flush_at:
                self._flush_event.set()
        except Exception:
            pass

    def _do_send(self, payload: Dict[str, Any]) -> None:
        """Send a single payload to the API (used by worker and flush)."""
        if not self.enabled:
            return
        try:
            if not self._check_circuit_breaker():
                return
            with httpx.Client(timeout=self.proxy_timeout) as client:
                client.post(
                    f"{self.api_url}/api/v1/projects/{self.project_id}/api-calls",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                )
                self._reset_circuit_breaker()
        except Exception:
            self._record_circuit_failure()

    def _worker_loop(self) -> None:
        """Background thread: flush queue by flush_interval or flush_at."""
        while not self._shutdown:
            self._flush_event.wait(timeout=self._flush_interval)
            self._flush_event.clear()
            batch = []
            for _ in range(self._flush_at):
                try:
                    batch.append(self._queue.get_nowait())
                except Empty:
                    break
            for i, p in enumerate(batch):
                if self._shutdown:
                    for q in batch[i:]:
                        self._queue.put_nowait(q)
                    break
                self._do_send(p)

    def flush(self) -> None:
        """Send all pending events immediately. Call before process exit in serverless/short-lived envs."""
        if not self.enabled:
            return
        batch = []
        try:
            while True:
                batch.append(self._queue.get_nowait())
        except Empty:
            pass
        for p in batch:
            self._do_send(p)

    def shutdown(self) -> None:
        """Flush pending events and stop the background worker. Call before process exit to avoid losing events."""
        self._shutdown = True
        self._flush_event.set()
        self.flush()
        if self._worker.is_alive():
            self._worker.join(timeout=5.0)

    def track_call(
        self,
        request_data: Dict[str, Any],
        response_data: Dict[str, Any],
        latency_ms: float,
        status_code: int = 200,
        agent_name: Optional[str] = None,
        chain_id: Optional[str] = None,
        tool_events: Optional[List[Dict[str, Any]]] = None,
    ):
        """
        Manually track an API call

        Use this if you want to manually track calls instead of using auto-patching.

        Args:
            request_data: Request payload
            response_data: Response payload
            latency_ms: Latency in milliseconds
            status_code: HTTP status code
            agent_name: Optional agent name
            chain_id: Optional chain ID to group related calls
            tool_events: Optional tool_call / tool_result / action timeline for Live View & Release Gate replay
        """
        if not self.enabled:
            return

        # Store chain_id and agent_name temporarily
        old_chain_id = getattr(self._local, 'chain_id', None)
        old_agent_name = getattr(self._local, 'agent_name', None)

        if chain_id:
            self._local.chain_id = chain_id
        if agent_name:
            self._local.agent_name = agent_name

        try:
            self._send_to_api(
                request_data,
                response_data,
                latency_ms,
                status_code,
                tool_events=tool_events,
            )
        finally:
            # Restore old values
            if old_chain_id is not None:
                self._local.chain_id = old_chain_id
            elif hasattr(self._local, 'chain_id') and not chain_id:
                delattr(self._local, 'chain_id')

            if old_agent_name is not None:
                self._local.agent_name = old_agent_name
            elif hasattr(self._local, 'agent_name') and not agent_name:
                delattr(self._local, 'agent_name')

    def _check_circuit_breaker(self) -> bool:
        """Check if circuit breaker allows requests"""
        if self._circuit_state == "closed":
            return True
        elif self._circuit_state == "open":
            # Check if recovery time has passed
            if self._circuit_opened_at:
                elapsed = time.time() - self._circuit_opened_at
                if elapsed >= self.circuit_breaker_config["recovery_time_seconds"]:
                    self._circuit_state = "half-open"
                    self._circuit_failures = 0
                    return True
            return False
        elif self._circuit_state == "half-open":
            return True
        return True

    def _record_circuit_failure(self):
        """Record a circuit breaker failure"""
        self._circuit_failures += 1
        if self._circuit_failures >= self.circuit_breaker_config["failure_threshold"]:
            self._circuit_state = "open"
            self._circuit_opened_at = time.time()

    def _reset_circuit_breaker(self):
        """Reset circuit breaker on success"""
        if self._circuit_state == "half-open":
            self._circuit_state = "closed"
            self._circuit_failures = 0
        elif self._circuit_state == "closed":
            self._circuit_failures = 0

    def _start_health_check(self):
        """Start periodic health check monitoring"""
        def health_check_loop():
            while True:
                try:
                    with httpx.Client(timeout=5.0) as client:
                        response = client.get(f"{self.api_url}/api/v1/health")
                        if response.status_code == 200:
                            self._reset_circuit_breaker()
                        else:
                            self._record_circuit_failure()
                except Exception:
                    self._record_circuit_failure()

                time.sleep(self.health_check_interval)

        # Start health check in background thread
        thread = threading.Thread(target=health_check_loop, daemon=True)
        thread.start()

    # ============================================
    # Signal Detection / Regression Status Methods
    # ============================================

    def check_status(
        self,
        response_text: str,
        request_data: Optional[Dict[str, Any]] = None,
        response_data: Optional[Dict[str, Any]] = None,
        baseline_response: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Check regression status for a response using signal-based detection.

        Returns status: 'safe', 'regressed', or 'critical'

        Args:
            response_text: The LLM response text to check
            request_data: Original request data (optional)
            response_data: Full response data including latency (optional)
            baseline_response: Previous response for comparison (optional)

        Returns:
            Dict with 'status', 'signals', 'signal_count', etc.

        Example:
            result = pluvianai.check_status(
                response_text="I cannot help with that.",
                request_data={"messages": [...]},
            )
            if result['status'] == 'critical':
                print("Critical issue detected!")
        """
        if not self.enabled:
            return {"status": "safe", "signals": [], "signal_count": 0}

        try:
            payload = {
                "project_id": int(self.project_id),
                "response_text": response_text,
                "request_data": request_data,
                "response_data": response_data,
                "baseline_response": baseline_response,
            }

            with httpx.Client(timeout=self.proxy_timeout) as client:
                response = client.post(
                    f"{self.api_url}/api/v1/projects/{self.project_id}/regression/check",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    return {"status": "safe", "signals": [], "signal_count": 0, "error": f"HTTP {response.status_code}"}

        except Exception as e:
            # Fail-open: return safe status on error
            return {"status": "safe", "signals": [], "signal_count": 0, "error": str(e)}

    def get_project_status(self) -> Dict[str, Any]:
        """
        Get the current regression status for the project.

        Returns:
            Dict with 'current_status', 'review_stats', 'worst_prompt_stats', etc.

        Example:
            status = pluvianai.get_project_status()
            print(f"Project status: {status['current_status']}")
        """
        if not self.enabled:
            return {"current_status": "safe", "error": "PluvianAI not enabled"}

        try:
            with httpx.Client(timeout=self.proxy_timeout) as client:
                response = client.get(
                    f"{self.api_url}/api/v1/projects/{self.project_id}/regression/status",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                    },
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    return {"current_status": "safe", "error": f"HTTP {response.status_code}"}

        except Exception as e:
            return {"current_status": "safe", "error": str(e)}

    def is_safe(
        self,
        response_text: str,
        request_data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Quick check if a response is safe (no regression detected).

        Args:
            response_text: The LLM response text to check
            request_data: Original request data (optional)

        Returns:
            True if status is 'safe', False otherwise

        Example:
            if pluvianai.is_safe(response.content):
                print("Response is safe!")
            else:
                print("Potential regression detected!")
        """
        result = self.check_status(response_text, request_data)
        return result.get("status") == "safe"


# Global instance
_global_instance: Optional[PluvianAI] = None


def init(
    api_key: Optional[str] = None,
    project_id: Optional[int] = None,
    api_url: Optional[str] = None,
    agent_name: Optional[str] = None,
    proxy_timeout: float = 30.0,
    firewall_timeout: float = 1.0,
    pii_timeout: float = 0.1,
    circuit_breaker: Optional[Dict[str, Any]] = None,
    health_check_interval: float = 30.0,
    flush_at: Optional[int] = None,
    flush_interval: Optional[float] = None,
    log_request_bodies: Optional[bool] = None,
    log_response_bodies: Optional[bool] = None,
    log_tool_event_payloads: Optional[bool] = None,
    max_request_body_bytes: Optional[int] = None,
    max_response_body_bytes: Optional[int] = None,
):
    """
    Initialize PluvianAI with zero-config setup

    This function automatically patches the OpenAI SDK to capture all API calls.
    Events are queued and sent in the background (batch by flush_at or flush_interval).

    Example:
        import pluvianai
        pluvianai.init()

        # Now all OpenAI calls are automatically monitored
        from openai import OpenAI
        client = OpenAI()
        response = client.chat.completions.create(...)

        # Before exit (e.g. serverless): pluvianai.flush() or pluvianai.shutdown()

    Args:
        api_key: PluvianAI API key (defaults to PLUVIANAI_API_KEY env var)
        project_id: Project ID (defaults to PLUVIANAI_PROJECT_ID env var)
        api_url: PluvianAI API URL (defaults to PLUVIANAI_API_URL env var)
        agent_name: Agent name for tracking (defaults to PLUVIANAI_AGENT_NAME env var)
        flush_at: Max events per batch (default 10; env PLUVIANAI_FLUSH_AT)
        flush_interval: Max seconds before sending a batch (default 5.0; env PLUVIANAI_FLUSH_INTERVAL)
    """
    global _global_instance
    _global_instance = PluvianAI(
        api_key=api_key,
        project_id=project_id,
        api_url=api_url,
        agent_name=agent_name,
        proxy_timeout=proxy_timeout,
        firewall_timeout=firewall_timeout,
        pii_timeout=pii_timeout,
        circuit_breaker=circuit_breaker,
        health_check_interval=health_check_interval,
        flush_at=flush_at,
        flush_interval=flush_interval,
        log_request_bodies=log_request_bodies,
        log_response_bodies=log_response_bodies,
        log_tool_event_payloads=log_tool_event_payloads,
        max_request_body_bytes=max_request_body_bytes,
        max_response_body_bytes=max_response_body_bytes,
    )
    _global_instance.init()


def chain(chain_id: str, agent_name: Optional[str] = None):
    """
    Context manager to set chain_id and agent_name for a chain of API calls

    Example:
        import pluvianai
        pluvianai.init()

        with pluvianai.chain("user-query-123", agent_name="data-collector"):
            response1 = openai.chat.completions.create(...)
            response2 = openai.chat.completions.create(...)
        # Both calls will have chain_id="user-query-123"
    """
    global _global_instance
    if not _global_instance:
        raise RuntimeError("PluvianAI not initialized. Call pluvianai.init() first.")
    return _global_instance.chain(chain_id, agent_name)


def track_call(
    request_data: Dict[str, Any],
    response_data: Dict[str, Any],
    latency_ms: float,
    status_code: int = 200,
    agent_name: Optional[str] = None,
    chain_id: Optional[str] = None,
    tool_events: Optional[List[Dict[str, Any]]] = None,
):
    """
    Manually track an API call

    Use this if you want to manually track calls instead of using auto-patching.

    Args:
        request_data: Request payload
        response_data: Response payload
        latency_ms: Latency in milliseconds
        status_code: HTTP status code
        agent_name: Optional agent name
        chain_id: Optional chain ID to group related calls
        tool_events: Optional tool_call / tool_result / action timeline
    """
    global _global_instance
    if _global_instance:
        _global_instance.track_call(
            request_data,
            response_data,
            latency_ms,
            status_code,
            agent_name,
            chain_id,
            tool_events=tool_events,
        )
    else:
        # Create a temporary instance
        instance = PluvianAI()
        instance.track_call(
            request_data,
            response_data,
            latency_ms,
            status_code,
            agent_name,
            chain_id,
            tool_events=tool_events,
        )


def check_status(
    response_text: str,
    request_data: Optional[Dict[str, Any]] = None,
    response_data: Optional[Dict[str, Any]] = None,
    baseline_response: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Check regression status for a response using signal-based detection.

    Returns status: 'safe', 'regressed', or 'critical'

    Args:
        response_text: The LLM response text to check
        request_data: Original request data (optional)
        response_data: Full response data including latency (optional)
        baseline_response: Previous response for comparison (optional)

    Returns:
        Dict with 'status', 'signals', 'signal_count', etc.

    Example:
        result = pluvianai.check_status(
            response_text="I cannot help with that.",
            request_data={"messages": [...]},
        )
        if result['status'] == 'critical':
            print("Critical issue detected!")
    """
    global _global_instance
    if _global_instance:
        return _global_instance.check_status(
            response_text, request_data, response_data, baseline_response
        )
    else:
        instance = PluvianAI()
        return instance.check_status(
            response_text, request_data, response_data, baseline_response
        )


def flush() -> None:
    """Send all pending events immediately. Call before process exit in serverless/short-lived envs."""
    global _global_instance
    if _global_instance:
        _global_instance.flush()


def shutdown() -> None:
    """Flush pending events and stop the background worker. Call before process exit to avoid losing events."""
    global _global_instance
    if _global_instance:
        _global_instance.shutdown()


def get_project_status() -> Dict[str, Any]:
    """
    Get the current regression status for the project.

    Returns:
        Dict with 'current_status', 'review_stats', 'worst_prompt_stats', etc.

    Example:
        status = pluvianai.get_project_status()
        print(f"Project status: {status['current_status']}")
    """
    global _global_instance
    if _global_instance:
        return _global_instance.get_project_status()
    else:
        instance = PluvianAI()
        return instance.get_project_status()


def is_safe(
    response_text: str,
    request_data: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Quick check if a response is safe (no regression detected).

    Args:
        response_text: The LLM response text to check
        request_data: Original request data (optional)

    Returns:
        True if status is 'safe', False otherwise

    Example:
        if pluvianai.is_safe(response.content):
            print("Response is safe!")
        else:
            print("Potential regression detected!")
    """
    global _global_instance
    if _global_instance:
        return _global_instance.is_safe(response_text, request_data)
    else:
        instance = PluvianAI()
        return instance.is_safe(response_text, request_data)


# CI Integration
from .ci import CIClient

__all__ = [
    "PluvianAI",
    "init",
    "chain",
    "track_call",
    "flush",
    "shutdown",
    "check_status",
    "get_project_status",
    "is_safe",
    "CIClient",
]
