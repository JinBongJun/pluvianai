"""
Billing endpoints (Paddle checkout + webhook + usage helpers).
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.responses import success_response
from app.core.security import (
    get_current_user,
    require_csrf_for_cookie_auth,
)
from app.models.user import User
from app.services.billing_service import BillingService

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan_type: str
    success_url: HttpUrl
    cancel_url: HttpUrl


@router.get("/usage")
def get_billing_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    usage = BillingService(db).get_current_usage(current_user.id)
    return success_response(data=usage)


@router.get("/limits")
def get_billing_limits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    usage = BillingService(db).get_current_usage(current_user.id)
    return success_response(
        data={
            "plan_type": usage.get("plan_type"),
            "limits": usage.get("limits"),
            "soft_caps": usage.get("soft_caps"),
        }
    )


@router.post("/checkout")
def create_checkout_session(
    req: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    _csrf: None = Depends(require_csrf_for_cookie_auth),
    db: Session = Depends(get_db),
):
    billing = BillingService(db)
    result = billing.create_checkout_session(
        user_id=current_user.id,
        plan_type=req.plan_type,
        success_url=str(req.success_url),
        cancel_url=str(req.cancel_url),
    )
    if not result or not result.get("url"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to create checkout session",
        )
    return success_response(data=result)


@router.post("/webhook/paddle")
async def handle_paddle_webhook(
    request: Request,
    paddle_signature: Optional[str] = Header(default=None, alias="Paddle-Signature"),
    db: Session = Depends(get_db),
):
    payload = await request.body()
    result = BillingService(db).handle_paddle_webhook(payload, paddle_signature or "")
    if result.get("error"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result["error"])
    return success_response(data=result)
