"""
Background tasks for async processing
"""

import asyncio
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.api_call import APICall
from app.services.data_normalizer import DataNormalizer
from app.utils.compression import optimize_api_call_data, compress_json
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

        # Trigger Shadow Routing in background (fire and forget)
        if api_call_id and api_key:
            try:
                asyncio.create_task(self._trigger_shadow_routing_async(project_id, api_call_id, request_data, api_key))
            except Exception as e:
                logger.error(f"Error triggering shadow routing: {str(e)}")

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

    async def _trigger_shadow_routing_async(
        self, project_id: int, api_call_id: int, request_data: Dict[str, Any], api_key: str
    ):
        """Trigger Shadow Routing asynchronously"""
        try:
            from app.services.shadow_routing_service import ShadowRoutingService
            from app.models.project import Project

            db: Session = SessionLocal()
            try:
                # Get project and API call
                project = db.query(Project).filter(Project.id == project_id).first()
                api_call = db.query(APICall).filter(APICall.id == api_call_id).first()

                if not project or not api_call:
                    return

                # Only trigger for successful API calls
                if api_call.status_code and 200 <= api_call.status_code < 300:
                    shadow_service = ShadowRoutingService()
                    await shadow_service.execute_shadow_routing(
                        project=project, primary_api_call=api_call, request_data=request_data, api_key=api_key, db=db
                    )
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in shadow routing: {str(e)}")


# Global instance
background_task_service = BackgroundTaskService()
