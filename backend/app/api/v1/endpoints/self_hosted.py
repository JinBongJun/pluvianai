"""
Self-hosted endpoints for Enterprise customers
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.decorators import handle_errors
from app.core.config import settings
from app.models.user import User
from app.core.logging_config import logger
import hashlib

router = APIRouter()


class SelfHostedStatusResponse(BaseModel):
    """Schema for self-hosted status response"""
    self_hosted_mode: bool
    license_valid: bool
    license_key_hash: Optional[str] = None
    message: str


class LicenseVerificationRequest(BaseModel):
    """Schema for license verification"""
    license_key: str


class LicenseVerificationResponse(BaseModel):
    """Schema for license verification response"""
    valid: bool
    message: str
    expires_at: Optional[str] = None


def verify_license_key(license_key: str) -> bool:
    """
    Verify self-hosted license key
    
    In production, this would:
    1. Check against a license server
    2. Verify signature
    3. Check expiration
    4. Validate enterprise plan
    
    For now, this is a placeholder that checks format
    """
    if not license_key:
        return False
    
    # Basic format check (in production, use proper license verification)
    # License key format: AGENTGUARD-ENTERPRISE-{hash}
    if license_key.startswith("AGENTGUARD-ENTERPRISE-") and len(license_key) > 30:
        return True
    
    # For development/testing, allow a test key
    if license_key == "TEST-LICENSE-KEY-DEVELOPMENT":
        logger.warning("Using test license key - not valid for production")
        return True
    
    return False


@router.get("/self-hosted/status", response_model=SelfHostedStatusResponse)
@handle_errors
async def get_self_hosted_status(
    current_user: User = Depends(get_current_user),
):
    """Get self-hosted status"""
    is_self_hosted = settings.SELF_HOSTED_MODE
    license_key = settings.SELF_HOSTED_LICENSE_KEY
    
    license_valid = False
    license_key_hash = None
    
    if is_self_hosted and license_key:
        license_valid = verify_license_key(license_key)
        # Hash license key for display (don't expose full key)
        license_key_hash = hashlib.sha256(license_key.encode()).hexdigest()[:16]
    
    message = "Self-hosted mode is active" if is_self_hosted else "Self-hosted mode is not enabled"
    if is_self_hosted and not license_valid:
        message += " (License invalid or missing)"
    
    return SelfHostedStatusResponse(
        self_hosted_mode=is_self_hosted,
        license_valid=license_valid,
        license_key_hash=license_key_hash,
        message=message
    )


@router.post("/self-hosted/license", response_model=LicenseVerificationResponse)
@handle_errors
async def verify_license(
    request: LicenseVerificationRequest,
    current_user: User = Depends(get_current_user),
):
    """Verify self-hosted license key (Enterprise only)"""
    # Check if user has enterprise plan
    # For now, we'll allow any authenticated user to verify
    # In production, check subscription plan
    
    is_valid = verify_license_key(request.license_key)
    
    if is_valid:
        logger.info(f"License key verified for user {current_user.id}")
        return LicenseVerificationResponse(
            valid=True,
            message="License key is valid",
            expires_at=None  # In production, extract from license
        )
    else:
        return LicenseVerificationResponse(
            valid=False,
            message="Invalid license key. Please contact AgentGuard support for Enterprise license.",
            expires_at=None
        )
