"""
Admin impersonation endpoints
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.decorators import handle_errors
from app.core.responses import success_response
from app.core.logging_config import logger
from app.core.dependencies import get_audit_service
from app.models.user import User
from app.services.impersonation_service import ImpersonationService

router = APIRouter()


class ImpersonationRequest(BaseModel):
    """Impersonation request schema"""
    reason: Optional[str] = None
    duration_minutes: int = 60


def _get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _get_user_agent(request: Request) -> Optional[str]:
    """Extract user agent from request"""
    return request.headers.get("User-Agent")


@router.post("/users/{user_id}/impersonate")
@handle_errors
async def start_impersonation(
    user_id: int,
    request_data: ImpersonationRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service),
):
    """
    Start impersonation session (admin only)
    
    Allows admin to temporarily access user data for debugging.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superusers can impersonate users"
        )

    service = ImpersonationService(db)
    
    try:
        session_id = service.start_impersonation(
            admin_user_id=current_user.id,
            target_user_id=user_id,
            reason=request_data.reason,
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
            duration_minutes=request_data.duration_minutes,
        )
        
        logger.info(
            f"Admin {current_user.id} started impersonation of user {user_id}",
            extra={"admin_user_id": current_user.id, "target_user_id": user_id, "session_id": session_id}
        )
        
        # Log audit event
        ip_address = _get_client_ip(request)
        user_agent = _get_user_agent(request)
        audit_service.log_action(
            user_id=current_user.id,
            action="admin_impersonation_started",
            resource_type="user",
            resource_id=user_id,
            new_value={
                "session_id": session_id,
                "target_user_id": user_id,
                "reason": request_data.reason,
                "duration_minutes": request_data.duration_minutes
            },
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return success_response(data={
            "session_id": session_id,
            "target_user_id": user_id,
            "expires_in_minutes": request_data.duration_minutes,
        })
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/impersonate/{session_id}")
@handle_errors
async def end_impersonation(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service),
):
    """
    End impersonation session (admin only)
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superusers can end impersonation sessions"
        )

    service = ImpersonationService(db)
    
    try:
        ended = service.end_impersonation(
            session_id=session_id,
            admin_user_id=current_user.id,
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )
        
        if not ended:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Impersonation session not found"
            )
        
        # Log audit event
        ip_address = _get_client_ip(request)
        user_agent = _get_user_agent(request)
        audit_service.log_action(
            user_id=current_user.id,
            action="admin_impersonation_ended",
            resource_type="impersonation_session",
            resource_id=None,
            new_value={"session_id": session_id},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return success_response(data={"message": "Impersonation session ended"})
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
