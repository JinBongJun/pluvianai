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
        
        # Sanitize payload before saving
        sanitized_payload = self.sanitizer.sanitize_payload(payload)
        is_sanitized = True  # Currently always sanitized by the service
        
        snapshot_data = {
            "trace_id": trace_id,
            "provider": provider,
            "model": model,
            "payload": sanitized_payload,
            "is_sanitized": is_sanitized,
            "status_code": status_code,
            "project_id": project_id,
        }
        
        # Try to write to Redis Stream (async buffering)
        if cache_service.enabled:
            try:
                stream_key = f"snapshot:stream:{project_id or 'default'}"
                # Use XADD to add to Redis Stream
                # Convert dict values to strings for Redis Stream
                stream_data = {
                    "trace_id": str(snapshot_data["trace_id"]),
                    "provider": str(snapshot_data["provider"]),
                    "model": str(snapshot_data["model"]),
                    "payload": json.dumps(snapshot_data["payload"]),  # JSON string
                    "is_sanitized": str(snapshot_data["is_sanitized"]),
                    "status_code": str(snapshot_data["status_code"]) if snapshot_data["status_code"] else "",
                    "project_id": str(project_id) if project_id else "",
                }
                cache_service.redis_client.xadd(
                    stream_key,
                    stream_data,
                    maxlen=10000  # Keep last 10k entries per project
                )
                # Successfully queued to Redis Stream - background worker will process
                return None  # Return None to indicate async queuing
            except Exception as e:
                # Fail-silent: Log error but don't block
                logger.warning(f"Failed to queue snapshot to Redis Stream: {str(e)}. Snapshot will be skipped.")
                return None  # Skip snapshot, don't block response
        
        # Fallback: If Redis is not available, save directly to DB (synchronous)
        # This is less ideal but ensures data is not lost
        logger.warning("Redis not available, saving snapshot directly to DB (synchronous)")
        snapshot = Snapshot(
            trace_id=trace_id,
            project_id=project_id,
            provider=provider,
            model=model,
            payload=sanitized_payload,
            is_sanitized=is_sanitized,
            status_code=status_code,
        )
        saved_snapshot = self.snapshot_repo.save(snapshot)
        
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
