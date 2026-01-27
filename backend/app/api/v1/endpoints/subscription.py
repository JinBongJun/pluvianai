"""
Subscription endpoints for plan management and billing
"""

from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.decorators import handle_errors
from app.core.config import settings
from app.core.logging_config import logger
from app.models.user import User
from app.services.subscription_service import SubscriptionService
from app.core.subscription_limits import PLAN_LIMITS, PLAN_PRICING

router = APIRouter()


class PlanResponse(BaseModel):
    """Plan information response"""

    plan_type: str
    price: int
    limits: Dict[str, Any]
    features: Dict[str, Any]


class SubscriptionResponse(BaseModel):
    """Current subscription response"""

    plan_type: str
    status: str
    price_per_month: float
    limits: Dict[str, Any]
    features: Dict[str, Any]
    current_period_start: str | None
    current_period_end: str | None
    trial_end: str | None
    usage: Dict[str, Any]


class UpgradeRequest(BaseModel):
    """Upgrade subscription request"""

    plan_type: str

    class Config:
        json_schema_extra = {"example": {"plan_type": "startup"}}


@router.get("", response_model=SubscriptionResponse)
@handle_errors
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> SubscriptionResponse:
    """
    Get current user's subscription and usage.
    
    Args:
        current_user: Authenticated user
        db: Database session
        
    Returns:
        SubscriptionResponse with plan details and usage
    """
    service = SubscriptionService(db)
    plan_info = service.get_user_plan(current_user.id)
    usage_summary = service.get_usage_summary(current_user.id)

    return SubscriptionResponse(
        plan_type=plan_info["plan_type"],
        status=plan_info["status"],
        price_per_month=plan_info["price_per_month"],
        limits=plan_info["limits"],
        features=plan_info["features"],
        current_period_start=plan_info["current_period_start"],
        current_period_end=plan_info["current_period_end"],
        trial_end=plan_info["trial_end"],
        usage=usage_summary,
    )


@router.get("/plans", response_model=List[PlanResponse])
@handle_errors
async def get_available_plans() -> List[PlanResponse]:
    """
    Get all available subscription plans.
    
    Returns:
        List of PlanResponse with plan details
    """
    return [
        PlanResponse(
            plan_type=plan_type,
            price=PLAN_PRICING.get(plan_type, 0),
            limits={
                "projects": limits["projects"],
                "api_calls_per_month": limits["api_calls_per_month"],
                "team_members_per_project": limits["team_members_per_project"],
                "data_retention_days": limits["data_retention_days"],
            },
            features=limits["features"],
        )
        for plan_type, limits in PLAN_LIMITS.items()
    ]


@router.post("/upgrade")
@handle_errors
async def initiate_upgrade(
    request: UpgradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Initiate subscription upgrade (returns Stripe checkout URL).
    
    Args:
        request: Upgrade request with plan_type
        current_user: Authenticated user
        db: Database session
        
    Returns:
        Standard response with checkout URL and session details
    """
    if request.plan_type not in PLAN_PRICING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan type: {request.plan_type}. Must be one of: {', '.join(PLAN_PRICING.keys())}",
        )

    from app.services.billing_service import BillingService
    from app.core.responses import success_response
    
    logger.info(
        f"User {current_user.id} requested upgrade to {request.plan_type}",
        extra={"user_id": current_user.id, "plan_type": request.plan_type}
    )
    
    billing_service = BillingService(db)
    base_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    success_url = f"{base_url}/settings/billing?success=true&plan={request.plan_type}"
    cancel_url = f"{base_url}/settings/billing?canceled=true"
    
    result = billing_service.create_stripe_checkout_session(
        user_id=current_user.id,
        plan_type=request.plan_type,
        success_url=success_url,
        cancel_url=cancel_url,
    )
    
    if not result:
        logger.error(
            f"Failed to create checkout session for user {current_user.id}",
            extra={"user_id": current_user.id, "plan_type": request.plan_type}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create checkout session. Please check Stripe configuration.",
        )
    
    logger.info(
        f"Checkout session created for user {current_user.id}: {result.get('session_id')}",
        extra={"user_id": current_user.id, "session_id": result.get("session_id")}
    )
    
    return success_response(data={
        "checkout_url": result["url"],
        "session_id": result["session_id"],
        "plan_type": request.plan_type,
        "price": PLAN_PRICING[request.plan_type],
    })


@router.post("/cancel")
@handle_errors
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, str]:
    """
    Cancel current subscription (cancels at period end)
    
    Returns:
        Dict with cancellation confirmation message
    """
    from app.models.subscription import Subscription

    subscription = db.query(Subscription).filter(
        Subscription.user_id == current_user.id
    ).first()

    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found"
        )

    subscription.cancel_at_period_end = "true"
    # Commit handled automatically by get_db() dependency

    logger.info(
        f"Subscription cancellation scheduled for user {current_user.id}",
        extra={"user_id": current_user.id, "subscription_id": subscription.id}
    )

    return {"message": "Subscription will be cancelled at period end"}
