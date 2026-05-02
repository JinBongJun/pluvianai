from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class ProfileResponse(BaseModel):
    """User profile response"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: Optional[str]
    avatar_url: Optional[str] = None
    is_active: bool
    is_email_verified: bool
    primary_auth_provider: str = "password"
    password_login_enabled: bool = True
    google_login_enabled: bool = False
    has_recent_google_delete_reauth: bool = False
    created_at: str


class UpdateProfileRequest(BaseModel):
    """Update profile request"""

    full_name: Optional[str] = None


class DeleteAccountRequest(BaseModel):
    """Delete account request"""

    password: str
    confirmation_text: str


class ChangePasswordRequest(BaseModel):
    """Change password request"""

    current_password: str
    new_password: str


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str


class NotificationSettingsResponse(BaseModel):
    """Notification settings response"""

    model_config = ConfigDict(from_attributes=True)

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


class CreateAPIKeyRequest(BaseModel):
    """Create API key request"""

    name: str
    scope: Optional[str] = None  # Default "*"; use "ingest" for SDK-only keys


class APIKeyResponse(BaseModel):
    """API key response (without actual key value)"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str]
    is_active: bool
    created_at: str
    last_used_at: Optional[str]
    # key_prefix shows first 12 chars for identification (ag_live_xxxx...)
    key_prefix: Optional[str] = None


class APIKeyCreatedResponse(BaseModel):
    """Response when API key is created (includes full key, shown only once)"""

    id: int
    name: Optional[str]
    api_key: str  # Full key, shown only once
    message: str
