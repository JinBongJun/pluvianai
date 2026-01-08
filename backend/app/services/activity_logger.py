"""
Activity logging service
"""
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.activity_log import ActivityLog


class ActivityLogger:
    """Service for logging user activities"""
    
    @staticmethod
    def log_activity(
        db: Session,
        user_id: int,
        activity_type: str,
        action: str,
        description: Optional[str] = None,
        project_id: Optional[int] = None,
        activity_data: Optional[Dict[str, Any]] = None
    ):
        """Log a user activity"""
        log = ActivityLog(
            user_id=user_id,
            project_id=project_id,
            activity_type=activity_type,
            action=action,
            description=description,
            activity_data=activity_data
        )
        db.add(log)
        db.commit()
        return log


activity_logger = ActivityLogger()
