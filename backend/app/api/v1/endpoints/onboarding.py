"""
Onboarding endpoints for Quick Start guides and Magic Setup Playground
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.logging_config import logger
from app.models.user import User
from app.services.onboarding_service import OnboardingService
from app.core.decorators import handle_errors

router = APIRouter()


class SimulateTrafficRequest(BaseModel):
    """Request schema for simulating virtual traffic"""
    project_id: int


class QuickStartResponse(BaseModel):
    """Response schema for Quick Start guide"""
    curl_command: str
    python_code: str
    node_code: str
    api_key: str
    project_id: int | None
    base_url: str


class OnboardingStatusResponse(BaseModel):
    """Response schema for onboarding status"""
    completed: bool
    has_project: bool
    has_snapshot: bool
    has_agreement: bool
    project_count: int
    snapshot_count: int


class LiabilityAgreementRequest(BaseModel):
    """Request schema for liability agreement acceptance"""
    liability_agreement_accepted: bool
    terms_of_service_accepted: bool
    privacy_policy_accepted: bool


@router.get("/quick-start", response_model=QuickStartResponse)
@handle_errors
async def get_quick_start(
    project_id: int | None = Query(None, description="Optional project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get Quick Start guide with curl commands"""
    service = OnboardingService(db)
    guide = service.generate_quick_start_guide(current_user.id, project_id)
    return QuickStartResponse(**guide)


@router.post("/simulate")
@handle_errors
async def simulate_traffic(
    request: SimulateTrafficRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate virtual agent traffic for Magic Setup Playground"""
    service = OnboardingService(db)
    try:
        result = service.simulate_virtual_traffic(current_user.id, request.project_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/status", response_model=OnboardingStatusResponse)
@handle_errors
async def get_onboarding_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check onboarding completion status"""
    service = OnboardingService(db)
    try:
        status_data = service.check_onboarding_status(current_user.id)
        return OnboardingStatusResponse(**status_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/first-snapshot-celebration")
@handle_errors
async def check_first_snapshot(
    project_id: int = Query(..., description="Project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if this is user's first snapshot and return celebration data"""
    service = OnboardingService(db)
    try:
        result = service.celebrate_first_snapshot(current_user.id, project_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/accept-agreement")
@handle_errors
async def accept_liability_agreement(
    agreement_data: LiabilityAgreementRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Accept liability agreement and terms of service (Click-through Liability Agreement)
    
    This is a mandatory step during onboarding to ensure users understand the limitations
    of AI Judge results and accept legal responsibility.
    """
    from app.models.user_agreement import UserAgreement
    from datetime import datetime
    
    # Get or create user agreement
    user_agreement = db.query(UserAgreement).filter(
        UserAgreement.user_id == current_user.id
    ).first()
    
    if not user_agreement:
        user_agreement = UserAgreement(user_id=current_user.id)
        db.add(user_agreement)
    
    # Update agreement status
    if agreement_data.liability_agreement_accepted:
        user_agreement.liability_agreement_accepted = True
        user_agreement.liability_agreement_accepted_at = datetime.utcnow()
    
    if agreement_data.terms_of_service_accepted:
        user_agreement.terms_of_service_accepted = True
        user_agreement.terms_of_service_accepted_at = datetime.utcnow()
    
    if agreement_data.privacy_policy_accepted:
        user_agreement.privacy_policy_accepted = True
        user_agreement.privacy_policy_accepted_at = datetime.utcnow()
    
    # Commit handled automatically by get_db() dependency
    db.refresh(user_agreement)
    
    logger.info(
        f"User {current_user.id} accepted liability agreement",
        extra={"user_id": current_user.id}
    )
    
    return {
        "accepted": True,
        "liability_agreement_accepted": user_agreement.liability_agreement_accepted,
        "terms_of_service_accepted": user_agreement.terms_of_service_accepted,
        "privacy_policy_accepted": user_agreement.privacy_policy_accepted,
    }
