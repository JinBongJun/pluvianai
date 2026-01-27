"""
Billing endpoints for usage tracking and Stripe integration
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.services.billing_service import BillingService

router = APIRouter()


class UsageResponse(BaseModel):
    """Response schema for usage data"""
    daily_usage: int
    monthly_usage: int
    judge_calls: int
    snapshots: int
    plan_type: str
    limits: dict
    soft_caps: dict


class CheckoutSessionRequest(BaseModel):
    """Request schema for creating checkout session"""
    plan_type: str
    success_url: str
    cancel_url: str


class CheckoutSessionResponse(BaseModel):
    """Response schema for checkout session"""
    session_id: str
    url: str


@router.get("/usage")
@handle_errors
async def get_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current usage for authenticated user
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        f"User {current_user.id} requested usage data",
        extra={"user_id": current_user.id}
    )
    
    service = BillingService(db)
    usage = service.get_current_usage(current_user.id)
    
    logger.info(
        f"Usage data retrieved for user {current_user.id}: {usage['monthly_usage']} API calls, {usage['snapshots']} snapshots",
        extra={"user_id": current_user.id, "monthly_usage": usage['monthly_usage']}
    )
    
    # Return using standard response format
    return success_response(data=usage)


@router.get("/limits")
@handle_errors
async def get_limits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get plan limits for authenticated user
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        f"User {current_user.id} requested plan limits",
        extra={"user_id": current_user.id}
    )
    
    from app.services.subscription_service import SubscriptionService
    subscription_service = SubscriptionService(db)
    plan_info = subscription_service.get_user_plan(current_user.id)
    
    result = {
        "plan_type": plan_info["plan_type"],
        "limits": plan_info["limits"],
        "features": plan_info["features"],
        "price_per_month": plan_info["price_per_month"],
    }
    
    logger.info(
        f"Plan limits retrieved for user {current_user.id}: {result['plan_type']} plan",
        extra={"user_id": current_user.id, "plan_type": result["plan_type"]}
    )
    
    # Return using standard response format
    return success_response(data=result)


@router.post("/checkout")
@handle_errors
async def create_checkout_session(
    request: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create Stripe checkout session for subscription upgrade
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        f"User {current_user.id} requested checkout session for plan: {request.plan_type}",
        extra={"user_id": current_user.id, "plan_type": request.plan_type}
    )
    
    service = BillingService(db)
    
    result = service.create_stripe_checkout_session(
        user_id=current_user.id,
        plan_type=request.plan_type,
        success_url=request.success_url,
        cancel_url=request.cancel_url,
    )
    
    if not result:
        logger.error(
            f"Failed to create checkout session for user {current_user.id}",
            extra={"user_id": current_user.id, "plan_type": request.plan_type}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create checkout session",
        )
    
    logger.info(
        f"Checkout session created for user {current_user.id}: {result.get('session_id')}",
        extra={"user_id": current_user.id, "session_id": result.get("session_id")}
    )
    
    # Return using standard response format
    return success_response(data=result, status_code=status.HTTP_201_CREATED)


@router.post("/webhook")
@handle_errors
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    """
    Handle Stripe webhook events
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        "Stripe webhook received",
        extra={"signature_present": bool(stripe_signature)}
    )
    
    service = BillingService(db)
    
    payload = await request.body()
    result = service.handle_stripe_webhook(payload, stripe_signature)
    
    if "error" in result:
        logger.error(
            f"Stripe webhook error: {result['error']}",
            extra={"error": result["error"]}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"],
        )
    
    logger.info(
        f"Stripe webhook processed successfully: {result.get('event_type', 'unknown')}",
        extra={"event_type": result.get("event_type")}
    )
    
    # Return using standard response format
    return success_response(data=result)
