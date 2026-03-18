"""
Background tasks for async processing
"""

import asyncio
import json
import uuid
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.api_call import APICall
from app.models.trace import Trace
from app.models.snapshot import Snapshot
from app.domain.live_view_release_gate import restore_agent_if_soft_deleted
from app.services.data_normalizer import DataNormalizer
from app.utils.compression import optimize_api_call_data, compress_json
from app.utils.tool_calls import extract_tool_calls_summary
from app.utils.secret_redaction import redact_secrets
from app.utils.agent_signature import build_node_key
from app.services.live_view_events import publish_agents_changed
from app.core.logging_config import logger


class BackgroundTaskService:
    """Service for handling background tasks"""

    def __init__(self):
        self.normalizer = DataNormalizer()

    async def save_api_call_async(
        self,
        project_id: int,
        request_data: Dict[str, Any],
        response_data: Dict[str, Any],
        normalized: Dict[str, Any],
        latency_ms: float,
        status_code: int,
        agent_name: Optional[str] = None,
        chain_id: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        """
        Save API call to database asynchronously
        This prevents blocking the main request
        """
        # Run in background thread to avoid blocking
        loop = asyncio.get_event_loop()
        api_call_id = await loop.run_in_executor(
            None,
            self._save_api_call_sync,
            project_id,
            request_data,
            response_data,
            normalized,
            latency_ms,
            status_code,
            agent_name,
            chain_id,
        )

        # Note: Shadow Routing functionality has been integrated into Production Guard (Firewall)

    def _save_api_call_sync(
        self,
        project_id: int,
        request_data: Dict[str, Any],
        response_data: Dict[str, Any],
        normalized: Dict[str, Any],
        latency_ms: float,
        status_code: int,
        agent_name: Optional[str],
        chain_id: Optional[str],
    ) -> Optional[int]:
        """Synchronous version for executor - returns API call ID"""
        db: Session = SessionLocal()
        try:
            request_data = redact_secrets(request_data or {})
            response_data = redact_secrets(response_data or {})

            # Optimize data before saving
            optimized_data = optimize_api_call_data(request_data, response_data)

            # Compress large JSON data
            request_data_compressed = compress_json(optimized_data.get("request", {}))
            response_data_compressed = compress_json(optimized_data.get("response", {}))

            # Extract prompt text (keep for search, but limit size)
            request_prompt = normalized.get("request_prompt")
            if request_prompt and len(request_prompt) > 5000:
                request_prompt = request_prompt[:5000] + "...[truncated]"

            response_text = normalized.get("response_text")
            if response_text and len(response_text) > 10000:
                response_text = response_text[:10000] + "...[truncated]"

            request_tokens = int(normalized.get("request_tokens") or 0)
            response_tokens = int(normalized.get("response_tokens") or 0)
            total_tokens = request_tokens + response_tokens if (request_tokens or response_tokens) else None

            request_content = request_prompt or (
                request_data_compressed if request_data_compressed else str(request_data)[:5000]
            )
            response_content = response_text or (
                response_data_compressed if response_data_compressed else str(response_data)[:10000]
            )

            api_call = APICall(
                project_id=project_id,
                provider=normalized.get("provider", "unknown"),
                model=normalized.get("model", "unknown"),
                request_content=request_content,
                response_content=response_content,
                total_tokens=total_tokens,
                cost=float(normalized.get("cost") or 0),
                latency_ms=int(latency_ms) if latency_ms is not None else None,
                status_code=status_code,
                agent_name=agent_name,
            )
            db.add(api_call)
            db.flush()  # Flush to get api_call.id if needed

            # Create Snapshot so Live View boxes appear (SDK traffic -> snapshots per design)
            trace_id = chain_id or str(uuid.uuid4())
            system_prompt = normalized.get("system_prompt")
            # v1.0 node identity: signature over provider/model/system_prompt/settings/tools (agent_name excluded)
            # For SDK path, the request payload is available as request_data.
            agent_id = build_node_key(
                provider=normalized.get("provider", "unknown"),
                model=normalized.get("model", "unknown"),
                system_prompt=system_prompt,
                request_payload=request_data or {},
            )
            request_prompt = normalized.get("request_prompt")
            response_text = normalized.get("response_text")
            payload_for_snapshot = {
                "request": request_data,
                "response": response_data,
            }
            tool_calls_summary = extract_tool_calls_summary(payload_for_snapshot)
            try:
                from app.models.project import Project as ProjectModel
                from app.core.usage_limits import check_snapshot_limit
                from app.models.agent_display_setting import AgentDisplaySetting
                from app.services.live_eval_service import (
                    evaluate_one_snapshot_at_save,
                    eval_config_version_hash,
                    normalize_eval_config,
                )

                project_obj = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
                snapshot_allowed = True
                if project_obj:
                    snapshot_allowed, _ = check_snapshot_limit(db, project_obj.owner_id, is_superuser=False)
                if not snapshot_allowed:
                    logger.warning(
                        f"Snapshot creation skipped for project {project_id}: free plan monthly limit reached."
                    )
                else:
                    trace = db.query(Trace).filter(Trace.id == trace_id).first()
                    if not trace:
                        trace = Trace(id=trace_id, project_id=project_id)
                        db.add(trace)
                        db.flush()

                    # Load eval config (project + agent) so SDK snapshots get eval_checks_result like proxy path
                    diagnostic_config = {}
                    if project_obj and project_obj.diagnostic_config:
                        diagnostic_config = (
                            project_obj.diagnostic_config
                            if isinstance(project_obj.diagnostic_config, dict)
                            else json.loads(project_obj.diagnostic_config)
                        )
                    if agent_id:
                        agent_settings = (
                            db.query(AgentDisplaySetting)
                            .filter(
                                AgentDisplaySetting.project_id == project_id,
                                AgentDisplaySetting.system_prompt_hash == agent_id,
                            )
                            .first()
                        )
                        if agent_settings and agent_settings.diagnostic_config:
                            agent_config = (
                                agent_settings.diagnostic_config
                                if isinstance(agent_settings.diagnostic_config, dict)
                                else json.loads(agent_settings.diagnostic_config)
                            )
                            if "eval" in agent_config and agent_config["eval"]:
                                diagnostic_config = dict(diagnostic_config) if diagnostic_config else {}
                                diagnostic_config["eval"] = agent_config["eval"]
                    eval_config = (diagnostic_config or {}).get("eval") if isinstance(diagnostic_config, dict) else {}
                    if not isinstance(eval_config, dict):
                        eval_config = {}
                    eval_config = normalize_eval_config(eval_config)

                    eval_checks_result = {}
                    eval_config_version = None
                    try:
                        eval_checks_result = evaluate_one_snapshot_at_save(
                            response_text=response_text or "",
                            latency_ms=int(latency_ms) if latency_ms is not None else None,
                            status_code=status_code,
                            tokens_used=None,
                            cost=None,
                            eval_config=eval_config,
                            payload=payload_for_snapshot,
                            project_id=project_id,
                            agent_id=agent_id,
                            db=db,
                        )
                        eval_config_version = eval_config_version_hash(eval_config)
                    except Exception as eval_err:
                        logger.warning(f"Failed to compute eval_checks_result for SDK snapshot (non-fatal): {eval_err}")

                    snapshot = Snapshot(
                        trace_id=trace_id,
                        project_id=project_id,
                        agent_id=agent_id,
                        provider=normalized.get("provider", "unknown"),
                        model=normalized.get("model", "unknown"),
                        system_prompt=system_prompt,
                        user_message=request_prompt,
                        response=response_text,
                        payload=payload_for_snapshot,
                        tool_calls_summary=tool_calls_summary if tool_calls_summary else None,
                        latency_ms=int(latency_ms) if latency_ms is not None else None,
                        status_code=status_code,
                        eval_checks_result=eval_checks_result,
                        eval_config_version=eval_config_version,
                    )
                    db.add(snapshot)
                    restore_agent_if_soft_deleted(db, project_id, agent_id)
            except Exception as snap_err:
                logger.warning(f"Failed to create snapshot for Live View (non-fatal): {snap_err}")

            # Track usage for subscription limits
            try:
                from app.models.project import Project
                from app.services.subscription_service import SubscriptionService

                project = db.query(Project).filter(Project.id == project_id).first()
                if project:
                    subscription_service = SubscriptionService(db)
                    subscription_service.increment_usage(
                        user_id=project.owner_id, metric_type="api_calls", amount=1, project_id=project_id
                    )
            except Exception as e:
                # Log error but don't fail the API call save
                logger.warning(f"Error tracking usage: {e}")

            db.commit()
            db.refresh(api_call)
            # Notify Live View dashboards (SSE) that this agent updated.
            try:
                publish_agents_changed(project_id, [agent_id])
            except Exception:
                pass
            return api_call.id
        except Exception as e:
            db.rollback()
            # Log error but don't fail
            logger.error(f"Error saving API call in background: {e}")
            return None
        finally:
            db.close()



# Global instance
background_task_service = BackgroundTaskService()
