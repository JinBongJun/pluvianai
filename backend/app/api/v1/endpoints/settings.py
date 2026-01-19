"""
Settings endpoints for user profile, password, API keys, and notifications
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from app.core.database import get_db
from app.core.security import get_current_user, verify_password, get_password_hash
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.models.user import User
from app.models.api_key import APIKey
import secrets
import hashlib

router = APIRouter()


# Profile Schemas
class ProfileUpdate(BaseModel):
    """Profile update schema"""
    full_name: Optional[str] = Field(None, max_length=255, description="Full name")


class ProfileResponse(BaseModel):
    """Profile response schema"""
    id: int
    email: str
    full_name: Optional[str]
    created_at: str
    updated_at: Optional[str]
    
    class Config:
        from_attributes = True


# Password Schemas
class PasswordChange(BaseModel):
    """Password change schema"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, max_length=72, description="New password (8-72 characters)")


class AccountDelete(BaseModel):
    """Account deletion schema"""
    password: str = Field(..., description="Password confirmation for account deletion")


# API Key Schemas
class APIKeyCreate(BaseModel):
    """API key creation schema"""
    name: str = Field(..., min_length=1, max_length=100, description="API key name/description")


class APIKeyUpdate(BaseModel):
    """API key update schema"""
    name: str = Field(..., min_length=1, max_length=100, description="New name for the API key")


class APIKeyResponse(BaseModel):
    """API key response schema"""
    id: int
    name: str
    key_prefix: str  # First 8 characters for display
    created_at: str
    last_used_at: Optional[str]
    
    class Config:
        from_attributes = True


class APIKeyCreateResponse(BaseModel):
    """API key creation response (includes full key)"""
    id: int
    name: str
    key: str  # Full key (only shown once)
    key_prefix: str
    created_at: str


# Notification Settings Schemas
class NotificationSettings(BaseModel):
    """Notification settings schema"""
    email_drift: bool = True
    email_cost_anomaly: bool = True
    email_quality_drop: bool = True
    in_app_drift: bool = True
    in_app_cost_anomaly: bool = True
    in_app_quality_drop: bool = True
    slack_enabled: bool = False
    slack_webhook_url: Optional[str] = None
    discord_enabled: bool = False
    discord_webhook_url: Optional[str] = None


class NotificationSettingsResponse(NotificationSettings):
    """Notification settings response"""
    pass


# Profile Endpoints
@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user profile"""
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        created_at=current_user.created_at.isoformat(),
        updated_at=current_user.updated_at.isoformat() if current_user.updated_at else None
    )


@router.patch("/profile", response_model=ProfileResponse)
@handle_errors
async def update_profile(
    profile_data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    logger.info(f"Updating profile for user {current_user.id}")
    
    if profile_data.full_name is not None:
        current_user.full_name = profile_data.full_name
    
    db.commit()
    db.refresh(current_user)
    logger.info(f"Profile updated successfully for user {current_user.id}")
    
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        created_at=current_user.created_at.isoformat(),
        updated_at=current_user.updated_at.isoformat() if current_user.updated_at else None
    )


@router.delete("/profile", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def delete_account(
    password: str = Query(..., description="Password confirmation for account deletion"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete user account (requires password confirmation)"""
    # Verify password
    if not verify_password(password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )
    
    logger.info(f"Deleting account for user {current_user.id}")
    
    # Delete user (cascade will handle related records)
    db.delete(current_user)
    db.commit()
    logger.info(f"Account deleted successfully for user {current_user.id}")
    return None


# Password Endpoints
@router.patch("/password", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect current password"
        )
    
    # Hash new password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    
    db.commit()
    logger.info(f"Password changed successfully for user {current_user.id}")
    return None


# API Key Endpoints
@router.get("/api-keys", response_model=List[APIKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all API keys for current user"""
    api_keys = db.query(APIKey).filter(APIKey.user_id == current_user.id).all()
    
    return [
        APIKeyResponse(
            id=key.id,
            name=key.name or "Unnamed",
            key_prefix=key.key_hash[:8] + "..." if len(key.key_hash) > 8 else key.key_hash,
            created_at=key.created_at.isoformat(),
            last_used_at=key.last_used_at.isoformat() if key.last_used_at else None
        )
        for key in api_keys
    ]


@router.post("/api-keys", response_model=APIKeyCreateResponse, status_code=status.HTTP_201_CREATED)
@handle_errors
async def create_api_key(
    key_data: APIKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new API key"""
    # Generate API key
    # Format: ag_live_<random_32_chars> or ag_test_<random_32_chars>
    random_part = secrets.token_urlsafe(32)
    api_key = f"ag_live_{random_part}"
    
    # Hash the key for storage
    hashed_key = hashlib.sha256(api_key.encode()).hexdigest()
    
    new_key = APIKey(
        user_id=current_user.id,
        name=key_data.name,
        key_hash=hashed_key,  # Store hashed version
        is_active=True
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)
    
    logger.info(f"API key created for user {current_user.id}")
    
    # Return the full key only once (client should save it)
    return APIKeyCreateResponse(
        id=new_key.id,
        name=new_key.name,
        key=api_key,  # Full unhashed key (only shown once)
        key_prefix=api_key[:8] + "...",
        created_at=new_key.created_at.isoformat()
    )


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an API key"""
    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id
    ).first()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    db.delete(api_key)
    db.commit()
    logger.info(f"API key {key_id} deleted for user {current_user.id}")
    return None


@router.patch("/api-keys/{key_id}", response_model=APIKeyResponse)
@handle_errors
async def update_api_key(
    key_id: int,
    update_data: APIKeyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update API key name"""
    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id
    ).first()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    api_key.name = update_data.name
    
    db.commit()
    db.refresh(api_key)
    logger.info(f"API key {key_id} updated for user {current_user.id}")
    
    return APIKeyResponse(
        id=api_key.id,
        name=api_key.name or "Unnamed",
        key_prefix=api_key.key_hash[:8] + "..." if len(api_key.key_hash) > 8 else api_key.key_hash,
        created_at=api_key.created_at.isoformat(),
        last_used_at=api_key.last_used_at.isoformat() if api_key.last_used_at else None
    )


# Notification Settings Endpoints
@router.get("/notifications", response_model=NotificationSettingsResponse)
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notification settings for current user"""
    from app.models.notification_settings import NotificationSettings as NotificationSettingsModel
    
    # Get or create notification settings
    notification_settings = db.query(NotificationSettingsModel).filter(
        NotificationSettingsModel.user_id == current_user.id
    ).first()
    
    if not notification_settings:
        # Create default settings for user
        notification_settings = NotificationSettingsModel(
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
        db.add(notification_settings)
        db.commit()
        db.refresh(notification_settings)
    
    return NotificationSettingsResponse(
        email_drift=notification_settings.email_drift,
        email_cost_anomaly=notification_settings.email_cost_anomaly,
        email_quality_drop=notification_settings.email_quality_drop,
        in_app_drift=notification_settings.in_app_drift,
        in_app_cost_anomaly=notification_settings.in_app_cost_anomaly,
        in_app_quality_drop=notification_settings.in_app_quality_drop,
        slack_enabled=notification_settings.slack_enabled,
        slack_webhook_url=notification_settings.slack_webhook_url,
        discord_enabled=notification_settings.discord_enabled,
        discord_webhook_url=notification_settings.discord_webhook_url,
    )


@router.patch("/notifications", response_model=NotificationSettingsResponse)
@handle_errors
async def update_notification_settings(
    settings: NotificationSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update notification settings for current user"""
    from app.models.notification_settings import NotificationSettings as NotificationSettingsModel
    
    # Get or create notification settings
    notification_settings = db.query(NotificationSettingsModel).filter(
        NotificationSettingsModel.user_id == current_user.id
    ).first()
    
    if not notification_settings:
        # Create new settings
        notification_settings = NotificationSettingsModel(user_id=current_user.id)
        db.add(notification_settings)
    
    # Update settings
    notification_settings.email_drift = settings.email_drift
    notification_settings.email_cost_anomaly = settings.email_cost_anomaly
    notification_settings.email_quality_drop = settings.email_quality_drop
    notification_settings.in_app_drift = settings.in_app_drift
    notification_settings.in_app_cost_anomaly = settings.in_app_cost_anomaly
    notification_settings.in_app_quality_drop = settings.in_app_quality_drop
    notification_settings.slack_enabled = settings.slack_enabled
    notification_settings.slack_webhook_url = settings.slack_webhook_url
    notification_settings.discord_enabled = settings.discord_enabled
    notification_settings.discord_webhook_url = settings.discord_webhook_url
    
    db.commit()
    db.refresh(notification_settings)
    logger.info(f"Notification settings updated for user {current_user.id}")
    
    return NotificationSettingsResponse(
        email_drift=notification_settings.email_drift,
        email_cost_anomaly=notification_settings.email_cost_anomaly,
        email_quality_drop=notification_settings.email_quality_drop,
        in_app_drift=notification_settings.in_app_drift,
        in_app_cost_anomaly=notification_settings.in_app_cost_anomaly,
        in_app_quality_drop=notification_settings.in_app_quality_drop,
        slack_enabled=notification_settings.slack_enabled,
        slack_webhook_url=notification_settings.slack_webhook_url,
        discord_enabled=notification_settings.discord_enabled,
        discord_webhook_url=notification_settings.discord_webhook_url,
    )

