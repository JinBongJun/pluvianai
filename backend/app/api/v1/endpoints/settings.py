"""
User settings endpoints
"""

import secrets
import hashlib
from typing import Optional, List
from datetime import datetime
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
from app.models.api_key import APIKey

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


# API Key Models
class CreateAPIKeyRequest(BaseModel):
    """Create API key request"""
    name: str


class APIKeyResponse(BaseModel):
    """API key response (without actual key value)"""
    id: int
    name: Optional[str]
    is_active: bool
    created_at: str
    last_used_at: Optional[str]
    # key_prefix shows first 12 chars for identification (ag_live_xxxx...)
    key_prefix: Optional[str] = None

    class Config:
        from_attributes = True


class APIKeyCreatedResponse(BaseModel):
    """Response when API key is created (includes full key, shown only once)"""
    id: int
    name: Optional[str]
    api_key: str  # Full key, shown only once
    message: str


def _generate_api_key_pair() -> tuple[str, str]:
    """Return (raw_api_key, sha256_hash_for_storage)."""
    key_prefix = "ag_live_"
    random_part = secrets.token_urlsafe(32)
    raw_api_key = f"{key_prefix}{random_part}"
    key_hash = hashlib.sha256(raw_api_key.encode()).hexdigest()
    return raw_api_key, key_hash


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
    
    # Flush pending mutation before refresh so updated fields are persisted in response.
    db.flush()
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
    """
    Get user's API keys for SDK authentication.
    
    Returns list of API keys with metadata (not the actual key values).
    Key values are only shown once at creation time.
    """
    logger.info(f"User {current_user.id} requested API keys")
    
    # Get user's API keys
    api_keys = db.query(APIKey).filter(
        APIKey.user_id == current_user.id,
        APIKey.is_active == True
    ).order_by(APIKey.created_at.desc()).all()
    
    result = []
    for key in api_keys:
        result.append({
            "id": key.id,
            "name": key.name,
            "is_active": key.is_active,
            "created_at": key.created_at.isoformat() if key.created_at else "",
            "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
            # Show first 12 chars of the hash as identifier (not the actual key)
            "key_prefix": f"ag_live_****{key.key_hash[:8]}..." if key.key_hash else None,
        })
    
    return success_response(data=result)


@router.post("/api-keys", response_model=APIKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
@handle_errors
async def create_api_key(
    request: CreateAPIKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new API key for SDK authentication.
    
    IMPORTANT: The full API key is only shown once in this response.
    Store it securely - it cannot be retrieved later.
    
    Format: ag_live_<random_string>
    """
    logger.info(f"User {current_user.id} creating new API key: {request.name}")
    
    # Validate name
    if not request.name or len(request.name.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key name is required"
        )
    
    if len(request.name) > 255:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key name must be 255 characters or less"
        )
    
    # Generate secure API key
    api_key_value, key_hash = _generate_api_key_pair()
    
    # Create API key record
    api_key = APIKey(
        user_id=current_user.id,
        key_hash=key_hash,
        name=request.name.strip(),
        is_active=True,
    )
    db.add(api_key)
    db.flush()
    db.refresh(api_key)
    
    logger.info(f"API key created for user {current_user.id}, key_id: {api_key.id}")
    
    return APIKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        api_key=api_key_value,
        message="API key created successfully. Save this key now - it won't be shown again!"
    )


@router.post("/api-keys/{key_id}/rotate", response_model=APIKeyCreatedResponse)
@handle_errors
async def rotate_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Rotate an API key.

    Creates a brand new key and deactivates the old key in one operation.
    Full key is returned only once.
    """
    logger.info(f"User {current_user.id} rotating API key: {key_id}")

    old_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id,
        APIKey.is_active == True,
    ).first()
    if not old_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    raw_api_key, key_hash = _generate_api_key_pair()
    new_key = APIKey(
        user_id=current_user.id,
        key_hash=key_hash,
        name=(old_key.name or "Rotated key"),
        is_active=True,
    )
    db.add(new_key)

    # Deactivate old key as part of rotation.
    old_key.is_active = False
    old_key.last_used_at = datetime.utcnow()

    db.flush()
    db.refresh(new_key)

    logger.info(
        f"API key rotated for user {current_user.id}: old_key_id={old_key.id}, new_key_id={new_key.id}"
    )
    return APIKeyCreatedResponse(
        id=new_key.id,
        name=new_key.name,
        api_key=raw_api_key,
        message="API key rotated successfully. Save this key now - it won't be shown again!",
    )


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete (deactivate) an API key.
    
    This action cannot be undone. Any applications using this key
    will no longer be able to authenticate.
    """
    logger.info(f"User {current_user.id} deleting API key: {key_id}")
    
    # Find the API key
    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id
    ).first()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    # Soft delete (deactivate)
    api_key.is_active = False
    db.flush()
    
    logger.info(f"API key {key_id} deleted for user {current_user.id}")
    return None


@router.patch("/api-keys/{key_id}")
@handle_errors
async def update_api_key(
    key_id: int,
    request: CreateAPIKeyRequest,  # Reuse for name update
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update API key name"""
    logger.info(f"User {current_user.id} updating API key: {key_id}")
    
    # Find the API key
    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id,
        APIKey.is_active == True
    ).first()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    # Update name
    if request.name:
        api_key.name = request.name.strip()
    
    db.flush()
    db.refresh(api_key)
    
    return success_response(data={
        "id": api_key.id,
        "name": api_key.name,
        "is_active": api_key.is_active,
        "created_at": api_key.created_at.isoformat() if api_key.created_at else "",
    })


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
