"""
Referral (viral) API: code, apply, stats.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.decorators import handle_errors
from app.core.responses import success_response
from app.core.logging_config import logger
from app.models.user import User
from app.services.referral_service import ReferralService

router = APIRouter()


class ApplyReferralRequest(BaseModel):
    referral_code: str


@router.get("/code")
@handle_errors
async def get_my_referral_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get or create current user's referral code."""
    svc = ReferralService(db)
    code = svc.generate_referral_code(current_user.id)
    return success_response(data={"code": code})


@router.post("/apply")
@handle_errors
async def apply_referral_code(
    body: ApplyReferralRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a referral code for the current user (e.g. at signup)."""
    svc = ReferralService(db)
    out = svc.process_referral(body.referral_code, current_user.id)
    if not out.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=out.get("error", "Invalid referral"),
        )
    return success_response(data=out)


@router.get("/stats")
@handle_errors
async def get_referral_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get referral stats for current user."""
    svc = ReferralService(db)
    stats = svc.get_referral_stats(current_user.id)
    return success_response(data=stats)
