import uuid
import json
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from app.models.trace import Trace
from app.models.snapshot import Snapshot
from app.services.pii_sanitizer import PIISanitizer
from app.core.logging_config import logger
from app.infrastructure.repositories.trace_repository import TraceRepository
from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
from app.utils.secret_redaction import redact_secrets


from app.core.diagnostics import calculate_diagnostic_scores
from app.domain.live_view_release_gate import restore_agent_if_soft_deleted
from app.services.live_eval_service import evaluate_one_snapshot_at_save, eval_config_version_hash
from app.utils.tool_calls import extract_tool_calls_summary
from app.utils.agent_signature import build_node_key


def _extract_agent_id(payload: Dict[str, Any]) -> Optional[str]:
    """Legacy helper (kept for compatibility). Prefer signature-based node keys."""
    for key in ("agent_id", "agentId", "agent_name", "agentName"):
        value = payload.get(key)
        if value is not None:
            text = str(value).strip()
            if text:
                return text
    return None


def _extract_request_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Return the request-shaped payload for signature extraction.
    - Proxy path sends the raw request JSON (model/messages/tools/settings)
    - Some SDK/manual paths wrap as {"request": ..., "response": ...}
    """
    if isinstance(payload.get("request"), dict):
        return payload["request"]
    return payload


def _extract_prompt_fields(payload: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Extract system/user/response fields from common request/response shapes."""
    system_prompt = payload.get("system_prompt")
    user_message = payload.get("user_message")
    response_text = payload.get("response")

    messages = payload.get("messages")
    if isinstance(messages, list):
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            role = str(msg.get("role") or "").lower()
            content = msg.get("content")
            if isinstance(content, list):
                # OpenAI multimodal style list; best effort flatten to string chunks
                text_chunks = []
                for c in content:
                    if isinstance(c, dict) and c.get("type") == "text":
                        text_chunks.append(str(c.get("text") or ""))
                content = "\n".join([t for t in text_chunks if t])
            if content is None:
                continue
            content_text = str(content)
            if role == "system" and not system_prompt:
                system_prompt = content_text
            elif role == "user" and not user_message:
                user_message = content_text

    # Try common nested response shapes
    if not response_text:
        response_obj = payload.get("response")
        if isinstance(response_obj, dict):
            if isinstance(response_obj.get("output_text"), str):
                response_text = response_obj.get("output_text")
            elif isinstance(response_obj.get("content"), str):
                response_text = response_obj.get("content")

    return {
        "system_prompt": str(system_prompt) if system_prompt is not None else None,
        "user_message": str(user_message) if user_message is not None else None,
        "response": str(response_text) if response_text is not None else None,
    }


class SnapshotService:
    """Service for capturing and storing AI request snapshots"""

    def __init__(
        self,
        trace_repo: TraceRepository,
        snapshot_repo: SnapshotRepository,
        db: Session
    ):
        self.trace_repo = trace_repo
        self.snapshot_repo = snapshot_repo
        self.db = db
        self.sanitizer = PIISanitizer(use_presidio=True, timeout_ms=100)  # 100ms timeout for PII sanitization

    def create_trace(self, project_id: int, trace_id: Optional[str] = None) -> Trace:
        """
        Create or retrieve a trace for grouping requests
        
        Args:
            project_id: Project ID
            trace_id: Optional trace ID (UUID). If not provided, generates a new one.
        
        Returns:
            Trace entity
        """
        if not trace_id:
            trace_id = str(uuid.uuid4())
        
        # Use repository to find or create
        trace = self.trace_repo.find_or_create(trace_id, project_id)
        # Transaction is managed by get_db() dependency
        return trace

    def save_snapshot(
        self,
        trace_id: str,
        provider: str,
        model: str,
        payload: Dict[str, Any],
        status_code: Optional[int] = None,
        project_id: Optional[int] = None
    ) -> Optional[Snapshot]:
        """
        Sanitize and save a snapshot using Redis Stream (async buffering)
        Fail-silent: If Redis fails, skip snapshot and return None (don't block response)
        
        Args:
            trace_id: Trace ID
            provider: LLM provider (openai, anthropic, etc.)
            model: Model name
            payload: Request payload (will be sanitized)
            status_code: Optional HTTP status code
            project_id: Optional project ID for stream key
        
        Returns:
            Snapshot entity if saved synchronously, None if queued to Redis Stream
        """
        from app.services.cache_service import cache_service
        from app.core.logging_config import logger
        import json
        
        # Redact secrets first, then run PII sanitization.
        redacted_payload = redact_secrets(payload)
        sanitized_payload = self.sanitizer.sanitize_payload(redacted_payload)
        is_sanitized = True  # Currently always sanitized by the service
        prompt_fields = _extract_prompt_fields(sanitized_payload)
        request_payload = _extract_request_payload(sanitized_payload)

        # v1.0 node identity: signature over provider/model/system_prompt/settings/tools (agent_name excluded)
        agent_id = build_node_key(
            provider=provider,
            model=model,
            system_prompt=prompt_fields.get("system_prompt"),
            request_payload=request_payload,
        )
        
        # Fetch project diagnostic_config and agent-specific overrides for threshold-based evaluation
        diagnostic_config = {}
        if project_id:
            try:
                from app.models.project import Project
                from app.models.agent_display_setting import AgentDisplaySetting
                
                # 1. Start with Project-level config
                project = self.db.query(Project).filter(Project.id == project_id).first()
                if project and project.diagnostic_config:
                    diagnostic_config = project.diagnostic_config if isinstance(project.diagnostic_config, dict) else json.loads(project.diagnostic_config)
                
                if agent_id:
                    agent_settings = self.db.query(AgentDisplaySetting).filter(
                        AgentDisplaySetting.project_id == project_id,
                        AgentDisplaySetting.system_prompt_hash == agent_id
                    ).first()
                    
                    if agent_settings and agent_settings.diagnostic_config:
                        agent_config = agent_settings.diagnostic_config if isinstance(agent_settings.diagnostic_config, dict) else json.loads(agent_settings.diagnostic_config)
                        
                        # Deep Merge: Agent config priority for thresholds, rules, and eval
                        if "thresholds" in agent_config or "rules" in agent_config:
                            # New nested structure
                            if "thresholds" not in diagnostic_config:
                                diagnostic_config = {"thresholds": diagnostic_config, "rules": {}}
                            
                            if "thresholds" in agent_config:
                                diagnostic_config["thresholds"].update(agent_config["thresholds"])
                            if "rules" in agent_config:
                                if "rules" not in diagnostic_config:
                                    diagnostic_config["rules"] = {}
                                diagnostic_config["rules"].update(agent_config["rules"])
                        else:
                            # Legacy flat config or mixed update
                            if "thresholds" in diagnostic_config:
                                diagnostic_config["thresholds"].update(agent_config)
                            else:
                                diagnostic_config.update(agent_config)
                        # Always apply agent's eval config (Live View eval) so save_snapshot can compute eval_checks_result
                        if "eval" in agent_config and agent_config["eval"]:
                            diagnostic_config["eval"] = agent_config["eval"]
                        
            except Exception as e:
                logger.warning(f"Failed to fetch diagnostic_config for evaluation: {str(e)}")

        # Calculate 12 extreme clinical diagnostics with project-specific thresholds
        evaluation_results = calculate_diagnostic_scores(payload, config=diagnostic_config)
        
        # Flatten results for legacy signal_result (score only) and detailed evaluation_result
        diagnostic_scores = {k: v["score"] for k, v in evaluation_results.items()}
        
        is_worst = payload.get("is_violation", False)

        # Live View eval checks at save time (always run so Worst/Golden and detail use stored eval)
        eval_config = (diagnostic_config or {}).get("eval") if isinstance(diagnostic_config, dict) else None
        eval_config = eval_config if isinstance(eval_config, dict) else {}
        eval_checks_result = None
        try:
            response_text = prompt_fields.get("response") or ""
            latency_ms = payload.get("latency_ms")
            if latency_ms is not None and not isinstance(latency_ms, (int, float)):
                latency_ms = None
            tokens_used = payload.get("tokens_used")
            cost_val = payload.get("cost")
            eval_checks_result = evaluate_one_snapshot_at_save(
                response_text=response_text,
                latency_ms=int(latency_ms) if latency_ms is not None else None,
                status_code=status_code,
                tokens_used=int(tokens_used) if tokens_used is not None else None,
                cost=float(cost_val) if cost_val is not None else None,
                eval_config=eval_config,
                payload=sanitized_payload,
                project_id=project_id,
                agent_id=agent_id,
                db=self.db,
            )
        except Exception as e:
            logger.warning(f"Failed to compute eval_checks_result at save: {e}")
            eval_checks_result = {}

        eval_config_version = None
        try:
            eval_config_version = eval_config_version_hash(eval_config)
        except Exception:
            pass
        tool_calls_summary = extract_tool_calls_summary(sanitized_payload)
        snapshot_data = {
            "trace_id": trace_id,
            "agent_id": agent_id,
            "provider": provider,
            "model": model,
            "system_prompt": prompt_fields.get("system_prompt"),
            "user_message": prompt_fields.get("user_message"),
            "response": prompt_fields.get("response"),
            "payload": sanitized_payload,
            "is_sanitized": is_sanitized,
            "status_code": status_code,
            "project_id": project_id,
            "signal_result": diagnostic_scores,
            "evaluation_result": evaluation_results,
            "is_worst": is_worst,
            "worst_status": "CRITICAL" if is_worst else None,
            "eval_checks_result": eval_checks_result,
            "eval_config_version": eval_config_version,
            "tool_calls_summary": tool_calls_summary if tool_calls_summary else None,
        }
        
        # Try to write to Redis Stream (async buffering)
        if cache_service.enabled:
            try:
                stream_key = f"snapshot:stream:{project_id or 'default'}"
                # Use XADD to add to Redis Stream
                # Convert dict values to strings for Redis Stream
                stream_data = {
                    "trace_id": str(snapshot_data["trace_id"]),
                    "agent_id": str(snapshot_data["agent_id"]) if snapshot_data["agent_id"] else "",
                    "provider": str(snapshot_data["provider"]),
                    "model": str(snapshot_data["model"]),
                    "system_prompt": str(snapshot_data["system_prompt"]) if snapshot_data["system_prompt"] else "",
                    "user_message": str(snapshot_data["user_message"]) if snapshot_data["user_message"] else "",
                    "response": str(snapshot_data["response"]) if snapshot_data["response"] else "",
                    "payload": json.dumps(snapshot_data["payload"]),  # JSON string
                    "is_sanitized": str(snapshot_data["is_sanitized"]),
                    "status_code": str(snapshot_data["status_code"]) if snapshot_data["status_code"] else "",
                    "project_id": str(project_id) if project_id else "",
                    "signal_result": json.dumps(snapshot_data["signal_result"]),
                    "evaluation_result": json.dumps(snapshot_data["evaluation_result"]),
                    "eval_checks_result": json.dumps(snapshot_data["eval_checks_result"]) if snapshot_data.get("eval_checks_result") else "",
                    "eval_config_version": str(snapshot_data["eval_config_version"]) if snapshot_data.get("eval_config_version") else "",
                    "is_worst": str(snapshot_data["is_worst"]),
                    "worst_status": str(snapshot_data["worst_status"]) if snapshot_data["worst_status"] else "",
                    "tool_calls_summary": json.dumps(snapshot_data["tool_calls_summary"]) if snapshot_data.get("tool_calls_summary") else "[]",
                }
                cache_service.redis_client.xadd(
                    stream_key,
                    stream_data,
                    maxlen=10000  # Keep last 10k entries per project
                )
                # Successfully queued to Redis Stream - background worker will process
                return None  # Return None to indicate async queuing
            except Exception as e:
                # Fall back to DB save if stream enqueue fails, so we don't lose snapshots.
                logger.warning(
                    f"Failed to queue snapshot to Redis Stream: {str(e)}. Falling back to direct DB save."
                )
        
        # Fallback: If Redis is not available, save directly to DB (synchronous)
        # This is less ideal but ensures data is not lost
        logger.warning("Redis not available, saving snapshot directly to DB (synchronous)")
        snapshot = Snapshot(
            trace_id=trace_id,
            project_id=project_id,
            agent_id=snapshot_data["agent_id"],
            provider=provider,
            model=model,
            system_prompt=snapshot_data["system_prompt"],
            user_message=snapshot_data["user_message"],
            response=snapshot_data["response"],
            payload=sanitized_payload,
            is_sanitized=is_sanitized,
            status_code=status_code,
            signal_result=snapshot_data["signal_result"],
            evaluation_result=snapshot_data["evaluation_result"],
            eval_checks_result=snapshot_data.get("eval_checks_result"),
            eval_config_version=snapshot_data.get("eval_config_version"),
            tool_calls_summary=snapshot_data.get("tool_calls_summary"),
            is_worst=snapshot_data["is_worst"],
            worst_status=snapshot_data["worst_status"],
        )
        saved_snapshot = self.snapshot_repo.save(snapshot)
        restore_agent_if_soft_deleted(self.db, project_id, saved_snapshot.agent_id)
        
        # Track snapshot usage for subscription limits (only in fallback mode)
        if project_id:
            try:
                from app.models.project import Project
                from app.services.billing_service import BillingService
                
                project = self.db.query(Project).filter(Project.id == project_id).first()
                if project:
                    billing_service = BillingService(self.db)
                    is_allowed, warning = billing_service.increment_usage(project.owner_id, "snapshots", 1)
                    
                    # Check if hard limit is enabled and limit exceeded
                    if not is_allowed:
                        logger.warning(
                            f"Snapshot creation blocked for project {project_id} (user {project.owner_id}): {warning}"
                        )
                        # Don't save snapshot if hard limit is exceeded
                        # Return None to indicate failure
                        return None
                    
                    if warning:
                        logger.info(f"Snapshot usage warning for project {project_id}: {warning}")
            except Exception as e:
                logger.warning(f"Failed to track snapshot usage: {str(e)}")
        
        return saved_snapshot
