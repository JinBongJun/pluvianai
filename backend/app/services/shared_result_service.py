"""
Shared Result service for creating and accessing shareable links
"""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.core.logging_config import logger
from app.models.shared_result import SharedResult


class SharedResultService:
    """Service for managing shared results"""

    def __init__(self, db: Session):
        self.db = db

    def create_shared_result(
        self,
        project_id: int,
        created_by: int,
        result_type: str,
        result_data: Dict[str, Any],
        result_id: Optional[int] = None,
        expires_in_days: Optional[int] = None,
    ) -> SharedResult:
        """
        Create a shareable result link
        
        Args:
            project_id: Project ID
            created_by: User ID who created the share
            result_type: Type of result ('model_validation', 'snapshot', 'test', etc.)
            result_data: The result data to share (JSON)
            result_id: Optional ID of the original result
            expires_in_days: Optional expiration in days (None = no expiration)
        
        Returns:
            Created SharedResult
        """
        # Generate unique token
        token = SharedResult.generate_token()
        
        # Ensure uniqueness
        while self.db.query(SharedResult).filter(SharedResult.token == token).first():
            token = SharedResult.generate_token()

        # Calculate expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        shared = SharedResult(
            project_id=project_id,
            created_by=created_by,
            token=token,
            result_type=result_type,
            result_id=result_id,
            result_data=result_data,
            read_only=True,
            expires_at=expires_at,
        )
        self.db.add(shared)
        self.db.commit()

        logger.info(
            f"Shared result created: {result_type} for project {project_id}",
            extra={
                "project_id": project_id,
                "created_by": created_by,
                "result_type": result_type,
                "token": token,
            }
        )

        return shared

    def get_shared_result(self, token: str) -> Optional[SharedResult]:
        """
        Get shared result by token (for guest view)
        
        Args:
            token: Share token
        
        Returns:
            SharedResult or None if not found/expired
        """
        shared = self.db.query(SharedResult).filter(SharedResult.token == token).first()
        
        if not shared:
            return None

        # Check expiration
        if shared.expires_at:
            now_utc = datetime.now(timezone.utc)
            expires_at = shared.expires_at
            if expires_at.tzinfo is None:
                now_utc = now_utc.replace(tzinfo=None)
            if expires_at < now_utc:
                return None

        return shared
