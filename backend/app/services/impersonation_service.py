"""
Impersonation service for admin access to user data
"""

import secrets
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.core.logging_config import logger
from app.models.user import User
from app.services.audit_service import AuditService

# In-memory session store (use Redis in production)
_impersonation_sessions: Dict[str, Dict[str, Any]] = {}


class ImpersonationService:
    """Service for managing admin impersonation sessions"""

    def __init__(self, db: Session):
        self.db = db
        self.audit_service = AuditService(db)

    def start_impersonation(
        self,
        admin_user_id: int,
        target_user_id: int,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        duration_minutes: int = 60,
    ) -> str:
        """
        Start an impersonation session
        
        Args:
            admin_user_id: Admin user ID
            target_user_id: Target user ID to impersonate
            reason: Optional reason for impersonation
            ip_address: IP address of the request
            user_agent: User agent string
            duration_minutes: Session duration in minutes (default: 60)
        
        Returns:
            Session ID
        """
        # Verify admin
        admin = self.db.query(User).filter(User.id == admin_user_id).first()
        if not admin or not admin.is_superuser:
            raise ValueError("Only superusers can impersonate")

        # Verify target user
        target = self.db.query(User).filter(User.id == target_user_id).first()
        if not target:
            raise ValueError("Target user not found")

        # Generate session ID
        session_id = f"imp_{secrets.token_urlsafe(16)}"

        # Create session
        now_utc = datetime.now(timezone.utc)
        expires_at = now_utc + timedelta(minutes=duration_minutes)
        _impersonation_sessions[session_id] = {
            "admin_user_id": admin_user_id,
            "target_user_id": target_user_id,
            "reason": reason,
            "created_at": now_utc,
            "expires_at": expires_at,
        }

        # Log audit event
        self.audit_service.log_action(
            user_id=admin_user_id,
            action="impersonation_started",
            resource_type="user",
            resource_id=target_user_id,
            new_value={
                "target_user_id": target_user_id,
                "reason": reason,
                "session_id": session_id,
                "expires_at": expires_at.isoformat(),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.warning(
            f"Admin {admin_user_id} started impersonation of user {target_user_id}",
            extra={
                "admin_user_id": admin_user_id,
                "target_user_id": target_user_id,
                "session_id": session_id,
                "reason": reason,
            }
        )

        return session_id

    def end_impersonation(
        self,
        session_id: str,
        admin_user_id: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> bool:
        """
        End an impersonation session
        
        Args:
            session_id: Session ID
            admin_user_id: Optional admin user ID (for verification)
            ip_address: IP address
            user_agent: User agent string
        
        Returns:
            True if session was ended, False if not found
        """
        session = _impersonation_sessions.get(session_id)
        if not session:
            return False

        # Verify admin if provided
        if admin_user_id and session["admin_user_id"] != admin_user_id:
            raise ValueError("Session does not belong to this admin")

        target_user_id = session["target_user_id"]
        admin_id = session["admin_user_id"]

        # Remove session
        del _impersonation_sessions[session_id]

        # Log audit event
        self.audit_service.log_action(
            user_id=admin_id,
            action="impersonation_ended",
            resource_type="user",
            resource_id=target_user_id,
            old_value={"session_id": session_id},
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            f"Admin {admin_id} ended impersonation session {session_id}",
            extra={"admin_user_id": admin_id, "session_id": session_id, "target_user_id": target_user_id}
        )

        return True

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get impersonation session
        
        Args:
            session_id: Session ID
        
        Returns:
            Session data or None if not found/expired
        """
        session = _impersonation_sessions.get(session_id)
        if not session:
            return None

        # Check expiration
        if session["expires_at"] < datetime.now(timezone.utc):
            del _impersonation_sessions[session_id]
            return None

        return session

    def get_target_user_id(self, session_id: str) -> Optional[int]:
        """
        Get target user ID from session
        
        Args:
            session_id: Session ID
        
        Returns:
            Target user ID or None
        """
        session = self.get_session(session_id)
        return session["target_user_id"] if session else None
