"""
Subscription endpoints for plan management and billing
"""
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
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
        json_schema_extra = {
            "example": {
                "plan_type": "startup"
            }
        }


@router.get("", response_model=SubscriptionResponse)
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's subscription and usage"""
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
        usage=usage_summary
    )


@router.get("/plans", response_model=List[PlanResponse])
async def get_available_plans():
    """Get all available subscription plans"""
    plans = []
    for plan_type, limits in PLAN_LIMITS.items():
        plans.append(PlanResponse(
            plan_type=plan_type,
            price=PLAN_PRICING.get(plan_type, 0),
            limits={
                "projects": limits["projects"],
                "api_calls_per_month": limits["api_calls_per_month"],
                "team_members_per_project": limits["team_members_per_project"],
                "data_retention_days": limits["data_retention_days"],
            },
            features=limits["features"]
        ))
    
    return plans


@router.post("/upgrade")
async def initiate_upgrade(
    request: UpgradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Initiate subscription upgrade (returns Paddle checkout URL)"""
    if request.plan_type not in PLAN_PRICING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan type: {request.plan_type}. Must be one of: {', '.join(PLAN_PRICING.keys())}"
        )
    
    # TODO: Integrate with Paddle API to create checkout
    # For now, return a placeholder response
    # In production, this would:
    # 1. Create a Paddle checkout session
    # 2. Store the checkout ID
    # 3. Return the checkout URL
    return {
        "checkout_url": f"https://checkout.paddle.com/...?plan={request.plan_type}&user_id={current_user.id}",
        "plan_type": request.plan_type,
        "price": PLAN_PRICING[request.plan_type]
    }


@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel current subscription (cancels at period end)"""
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
    # Don't change status to cancelled immediately - keep it active until period end
    db.commit()
    
    return {"message": "Subscription will be cancelled at period end"}


@router.post("/webhooks/paddle")
async def handle_paddle_webhook(
    payload: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Handle Paddle webhook events
    Events: subscription.created, subscription.updated, subscription.cancelled
    """
    # TODO: Verify Paddle webhook signature
    # TODO: Handle different webhook event types
    
    event_type = payload.get("event_type")
    
    if event_type == "subscription.created":
        # Create new subscription
        user_id = payload.get("user_id")  # This should map to your user ID
        plan_type = payload.get("plan_id")  # Map Paddle plan ID to your plan type
        # ... handle creation
        pass
    elif event_type == "subscription.updated":
        # Update existing subscription
        pass
    elif event_type == "subscription.cancelled":
        # Cancel subscription
        pass
    
    return {"status": "ok"}

