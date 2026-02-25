"""
Background tasks for async processing
"""

import asyncio
import uuid
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.api_call import APICall
from app.models.trace import Trace
from app.models.snapshot import Snapshot
from app.services.data_normalizer import DataNormalizer
from app.utils.compression import optimize_api_call_data, compress_json
from app.utils.tool_calls import extract_tool_calls_summary
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

            api_call = APICall(
                project_id=project_id,
                provider=normalized.get("provider", "unknown"),
                model=normalized.get("model", "unknown"),
                request_data={"compressed": request_data_compressed} if request_data_compressed else {},
                request_prompt=request_prompt,
                request_tokens=normalized.get("request_tokens"),
                response_data={"compressed": response_data_compressed} if response_data_compressed else {},
                response_text=response_text,
                response_tokens=normalized.get("response_tokens"),
                latency_ms=latency_ms,
                status_code=status_code,
                agent_name=agent_name,
                chain_id=chain_id,
            )
            db.add(api_call)
            db.flush()  # Flush to get api_call.id if needed

            # Create Snapshot so Live View boxes appear (SDK traffic -> snapshots per design)
            trace_id = chain_id or str(uuid.uuid4())
            agent_id = (agent_name or "unknown").strip() or "unknown"
            system_prompt = normalized.get("system_prompt")
            request_prompt = normalized.get("request_prompt")
            response_text = normalized.get("response_text")
            payload_for_snapshot = {
                "request": request_data,
                "response": response_data,
            }
            tool_calls_summary = extract_tool_calls_summary(payload_for_snapshot)
            try:
                trace = db.query(Trace).filter(Trace.id == trace_id).first()
                if not trace:
                    trace = Trace(id=trace_id, project_id=project_id)
                    db.add(trace)
                    db.flush()
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
                )
                db.add(snapshot)
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
                print(f"Error tracking usage: {e}")

            db.commit()
            db.refresh(api_call)
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
