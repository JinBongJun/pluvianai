"""
User settings endpoints
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import get_current_user, verify_password, get_password_hash
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.notification_settings import NotificationSettings

router = APIRouter()


class ProfileResponse(BaseModel):
    """User profile response"""
    id: int
    email: str
    full_name: Optional[str]
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    """Update profile request"""
    full_name: Optional[str] = None


class DeleteAccountRequest(BaseModel):
    """Delete account request"""
    password: str


class ChangePasswordRequest(BaseModel):
    """Change password request"""
    current_password: str
    new_password: str


class NotificationSettingsResponse(BaseModel):
    """Notification settings response"""
    email_drift: bool
    email_cost_anomaly: bool
    email_quality_drop: bool
    in_app_drift: bool
    in_app_cost_anomaly: bool
    in_app_quality_drop: bool
    slack_enabled: bool
    slack_webhook_url: Optional[str]
    discord_enabled: bool
    discord_webhook_url: Optional[str]

    class Config:
        from_attributes = True


class UpdateNotificationSettingsRequest(BaseModel):
    """Update notification settings request"""
    email_drift: Optional[bool] = None
    email_cost_anomaly: Optional[bool] = None
    email_quality_drop: Optional[bool] = None
    in_app_drift: Optional[bool] = None
    in_app_cost_anomaly: Optional[bool] = None
    in_app_quality_drop: Optional[bool] = None
    slack_enabled: Optional[bool] = None
    slack_webhook_url: Optional[str] = None
    discord_enabled: Optional[bool] = None
    discord_webhook_url: Optional[str] = None


@router.get("/profile", response_model=ProfileResponse)
@handle_errors
async def get_profile(
    current_user: User = Depends(get_current_user),
):
    """Get current user profile"""
    logger.info(f"User {current_user.id} requested profile")
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=bool(current_user.is_active),
        created_at=current_user.created_at.isoformat() if current_user.created_at else "",
    )


@router.patch("/profile", response_model=ProfileResponse)
@handle_errors
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile"""
    logger.info(f"User {current_user.id} updating profile")
    
    if request.full_name is not None:
        current_user.full_name = request.full_name
    
    # Note: get_db() dependency automatically commits, so db.commit() is not needed
    db.refresh(current_user)
    
    logger.info(f"Profile updated for user {current_user.id}")
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=bool(current_user.is_active),
        created_at=current_user.created_at.isoformat() if current_user.created_at else "",
    )


@router.delete("/profile", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def delete_account(
    request: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete user account (requires password confirmation)"""
    logger.info(f"User {current_user.id} requesting account deletion")
    
    # Verify password
    if not verify_password(request.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )
    
    # Delete user (cascade will handle related records)
    db.delete(current_user)
    # Note: get_db() dependency automatically commits, so db.commit() is not needed
    
    logger.info(f"Account deleted for user {current_user.id}")
    return None


@router.patch("/password")
@handle_errors
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change user password"""
    logger.info(f"User {current_user.id} changing password")
    
    # Verify current password
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid current password"
        )
    
    # Validate new password length
    if len(request.new_password) < 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 12 characters long"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(request.new_password)
    # Note: get_db() dependency automatically commits, so db.commit() is not needed
    
    logger.info(f"Password changed for user {current_user.id}")
    return success_response(data={"message": "Password changed successfully"})


@router.get("/api-keys")
@handle_errors
async def get_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user API keys"""
    logger.info(f"User {current_user.id} requested API keys")
    
    # Get user API keys (from user_api_keys endpoint, but at user level)
    # For now, return empty list as user_api_keys are project-specific
    # This endpoint might need to be implemented differently based on requirements
    return success_response(data=[])


@router.get("/notifications", response_model=NotificationSettingsResponse)
@handle_errors
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user notification settings"""
    logger.info(f"User {current_user.id} requested notification settings")
    
    # Get or create notification settings
    settings = db.query(NotificationSettings).filter(
        NotificationSettings.user_id == current_user.id
    ).first()
    
    if not settings:
        # Create default settings
        settings = NotificationSettings(
            user_id=current_user.id,
            email_drift=True,
            email_cost_anomaly=True,
            email_quality_drop=True,
            in_app_drift=True,
            in_app_cost_anomaly=True,
            in_app_quality_drop=True,
            slack_enabled=False,
            discord_enabled=False,
        )
        db.add(settings)
        # Note: get_db() dependency automatically commits, so db.commit() is not needed
        db.refresh(settings)
    
    return settings


@router.patch("/notifications", response_model=NotificationSettingsResponse)
@handle_errors
async def update_notification_settings(
    request: UpdateNotificationSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user notification settings"""
    logger.info(f"User {current_user.id} updating notification settings")
    
    # Get or create notification settings
    settings = db.query(NotificationSettings).filter(
        NotificationSettings.user_id == current_user.id
    ).first()
    
    if not settings:
        settings = NotificationSettings(user_id=current_user.id)
        db.add(settings)
    
    # Update fields
    if request.email_drift is not None:
        settings.email_drift = request.email_drift
    if request.email_cost_anomaly is not None:
        settings.email_cost_anomaly = request.email_cost_anomaly
    if request.email_quality_drop is not None:
        settings.email_quality_drop = request.email_quality_drop
    if request.in_app_drift is not None:
        settings.in_app_drift = request.in_app_drift
    if request.in_app_cost_anomaly is not None:
        settings.in_app_cost_anomaly = request.in_app_cost_anomaly
    if request.in_app_quality_drop is not None:
        settings.in_app_quality_drop = request.in_app_quality_drop
    if request.slack_enabled is not None:
        settings.slack_enabled = request.slack_enabled
    if request.slack_webhook_url is not None:
        settings.slack_webhook_url = request.slack_webhook_url
    if request.discord_enabled is not None:
        settings.discord_enabled = request.discord_enabled
    if request.discord_webhook_url is not None:
        settings.discord_webhook_url = request.discord_webhook_url
    
    # Note: get_db() dependency automatically commits, so db.commit() is not needed
    db.refresh(settings)
    
    logger.info(f"Notification settings updated for user {current_user.id}")
    return settings
