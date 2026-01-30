"""
Audit service for logging all important actions for compliance
"""

from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.core.logging_config import logger


class AuditService:
    """Service for logging audit events"""

    def __init__(self, db: Session):
        self.db = db

    def log_action(
        self,
        user_id: Optional[int],
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[int] = None,
        old_value: Optional[Dict[str, Any]] = None,
        new_value: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """
        Log an audit action
        
        Args:
            user_id: User ID (None for system actions)
            action: Action name (e.g., 'project_created', 'firewall_rule_updated')
            resource_type: Type of resource affected (e.g., 'project', 'firewall_rule')
            resource_id: ID of the affected resource
            old_value: Previous state (JSON)
            new_value: New state (JSON)
            ip_address: IP address of the request
            user_agent: User agent string
        
        Returns:
            Created AuditLog
        """
        log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(log)
        # Note: commit handled by get_db() dependency - no need to commit here
        
        logger.info(
            f"Audit log created: {action}",
            extra={
                "user_id": user_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
            }
        )
        
        return log

    def get_audit_logs(
        self,
        user_id: Optional[int] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLog]:
        """
        Get audit logs with filters
        
        Args:
            user_id: Filter by user ID
            action: Filter by action
            resource_type: Filter by resource type
            resource_id: Filter by resource ID
            limit: Max results
            offset: Offset for pagination
        
        Returns:
            List of AuditLog entries
        """
        query = self.db.query(AuditLog)
        
        if user_id is not None:
            query = query.filter(AuditLog.user_id == user_id)
        if action:
            query = query.filter(AuditLog.action == action)
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)
        if resource_id is not None:
            query = query.filter(AuditLog.resource_id == resource_id)
        
        return query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
