from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    """User registration schema"""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=72, description="Password (8-72 characters)")
    full_name: str | None = Field(None, max_length=255, description="Full name")
    liability_agreement_accepted: bool = Field(False, description="User must accept liability agreement")


class UserResponse(BaseModel):
    """User response schema"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str | None
    avatar_url: str | None = None
    is_active: bool
    is_email_verified: bool
    primary_auth_provider: str = "password"
    password_login_enabled: bool = True
    google_login_enabled: bool = False


class TokenResponse(BaseModel):
    """Token response schema"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Token refresh schema"""

    refresh_token: str | None = None


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class VerifyEmailResponse(BaseModel):
    verified: bool
    purpose: str
    email: str
