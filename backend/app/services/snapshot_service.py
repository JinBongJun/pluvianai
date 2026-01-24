import uuid
import json
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from app.models.trace import Trace
from app.models.snapshot import Snapshot
from app.services.pii_sanitizer import PIISanitizer
from app.core.logging_config import logger

class SnapshotService:
    """Service for capturing and storing AI request snapshots"""

    def __init__(self):
        self.sanitizer = PIISanitizer()

    def create_trace(self, db: Session, project_id: int, trace_id: Optional[str] = None) -> Trace:
        """Create or retrieve a trace for grouping requests"""
        if not trace_id:
            trace_id = str(uuid.uuid4())
        
        # Check if trace already exists
        db_trace = db.query(Trace).filter(Trace.id == trace_id).first()
        if not db_trace:
            db_trace = Trace(id=trace_id, project_id=project_id)
            db.add(db_trace)
            db.commit()
            db.refresh(db_trace)
        
        return db_trace

    def save_snapshot(
        self, 
        db: Session, 
        trace_id: str, 
        provider: str, 
        model: str, 
        payload: Dict[str, Any],
        status_code: Optional[int] = None
    ) -> Snapshot:
        """Sanitize and save a snapshot to the database"""
        try:
            # Sanitize payload before saving
            sanitized_payload = self.sanitizer.sanitize_payload(payload)
            is_sanitized = True # Currently always santized by the service
            
            db_snapshot = Snapshot(
                trace_id=trace_id,
                provider=provider,
                model=model,
                payload=sanitized_payload,
                is_sanitized=is_sanitized,
                status_code=status_code
            )
            
            db.add(db_snapshot)
            db.commit()
            db.refresh(db_snapshot)
            return db_snapshot
        except Exception as e:
            logger.error(f"Failed to save snapshot for trace {trace_id}: {str(e)}")
            db.rollback()
            raise e

# Global instance
snapshot_service = SnapshotService()
