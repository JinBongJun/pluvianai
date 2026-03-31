"""
Billing endpoints (Paddle checkout + webhook + usage helpers).
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, Request, status
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_superuser
from app.core.responses import error_response, success_response
from app.core.security import (
    get_current_user,
    require_csrf_for_cookie_auth,
)
from app.core.subscription_limits import normalize_plan_type
from app.models.user import User
from app.services.billing_service import BillingService

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan_type: str
    success_url: HttpUrl
    cancel_url: HttpUrl


class ChangePlanRequest(BaseModel):
    plan_type: str


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
    normalized = normalize_plan_type(req.plan_type)
    if normalized not in ("starter", "pro"):
        return error_response(
            code="BILLING_CHECKOUT_INVALID_PLAN",
            message="Self-serve checkout is only available for Starter and Pro.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    billing = BillingService(db)
    result = billing.create_checkout_session(
        user_id=current_user.id,
        plan_type=normalized,
        success_url=str(req.success_url),
        cancel_url=str(req.cancel_url),
    )
    if not result or not result.get("url"):
        return error_response(
            code="BILLING_CHECKOUT_UNAVAILABLE",
            message="Failed to create checkout session",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return success_response(data=result)


@router.get("/subscription")
def get_billing_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Next billing date and current period bounds from Paddle (paid accounts only)."""
    billing = BillingService(db)
    result, err = billing.get_billing_subscription_snapshot(current_user.id)
    if err == "paddle_not_configured":
        return error_response(
            code="BILLING_UNAVAILABLE",
            message="Billing is temporarily unavailable.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if err == "no_paddle_subscription":
        return error_response(
            code="BILLING_NO_SUBSCRIPTION",
            message="No active Paddle subscription on file.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    if err == "paddle_lookup_failed":
        return error_response(
            code="BILLING_PADDLE_LOOKUP_FAILED",
            message="Could not load subscription from Paddle. Try again shortly.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if not result:
        return error_response(
            code="BILLING_SUBSCRIPTION_FAILED",
            message="Could not load subscription details.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return success_response(data=result)


@router.post("/preview-plan-change")
def preview_plan_change(
    req: ChangePlanRequest,
    current_user: User = Depends(get_current_user),
    _csrf: None = Depends(require_csrf_for_cookie_auth),
    db: Session = Depends(get_db),
):
    """Preview proration / next renewal for Starter ↔ Pro before applying changes."""
    normalized = normalize_plan_type(req.plan_type)
    if normalized not in ("starter", "pro"):
        return error_response(
            code="BILLING_CHANGE_PLAN_INVALID",
            message="Plan preview is only available between Starter and Pro.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    billing = BillingService(db)
    result, err = billing.preview_paddle_subscription_plan(current_user.id, normalized)
    if err == "paddle_not_configured":
        return error_response(
            code="BILLING_UNAVAILABLE",
            message="Billing is temporarily unavailable.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if err == "invalid_plan":
        return error_response(
            code="BILLING_CHANGE_PLAN_INVALID",
            message="Invalid plan.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if err == "same_plan":
        return error_response(
            code="BILLING_CHANGE_PLAN_SAME",
            message="You are already on this plan.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if err == "checkout_required":
        return error_response(
            code="BILLING_CHANGE_PLAN_USE_CHECKOUT",
            message="Use checkout to subscribe first.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if err == "subscription_inactive":
        return error_response(
            code="BILLING_SUBSCRIPTION_INACTIVE",
            message="This subscription cannot be changed.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if err == "subscription_past_due":
        return error_response(
            code="BILLING_SUBSCRIPTION_PAST_DUE",
            message="Update your payment method in the billing portal before changing plans.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if err == "paddle_lookup_failed":
        return error_response(
            code="BILLING_PADDLE_LOOKUP_FAILED",
            message="Could not load subscription from Paddle. Try again shortly.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if err == "paddle_error" or not result:
        return error_response(
            code="BILLING_PREVIEW_FAILED",
            message="Could not preview plan change. Try again or use the billing portal.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return success_response(data=result)


@router.post("/change-plan")
def change_subscription_plan(
    req: ChangePlanRequest,
    current_user: User = Depends(get_current_user),
    _csrf: None = Depends(require_csrf_for_cookie_auth),
    db: Session = Depends(get_db),
):
    """
    Switch Starter ↔ Pro on the existing Paddle subscription (no new checkout).
    Upgrades use prorated immediate billing; downgrades use next-billing-period per Paddle.
    Free accounts must use /billing/checkout instead.
    """
    normalized = normalize_plan_type(req.plan_type)
    if normalized not in ("starter", "pro"):
        return error_response(
            code="BILLING_CHANGE_PLAN_INVALID",
            message="Plan change is only available between Starter and Pro.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    billing = BillingService(db)
    result, err = billing.change_paddle_subscription_plan(current_user.id, normalized)
    if err == "paddle_not_configured":
        return error_response(
            code="BILLING_UNAVAILABLE",
            message="Billing is temporarily unavailable.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if err == "invalid_plan":
        return error_response(
            code="BILLING_CHANGE_PLAN_INVALID",
            message="Invalid plan.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if err == "same_plan":
        return error_response(
            code="BILLING_CHANGE_PLAN_SAME",
            message="You are already on this plan.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if err == "checkout_required":
        return error_response(
            code="BILLING_CHANGE_PLAN_USE_CHECKOUT",
            message="Use checkout to subscribe or change from your current state.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if err == "subscription_inactive":
        return error_response(
            code="BILLING_SUBSCRIPTION_INACTIVE",
            message="This subscription cannot be changed. Open the billing portal or subscribe again.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if err == "subscription_past_due":
        return error_response(
            code="BILLING_SUBSCRIPTION_PAST_DUE",
            message="Update your payment method in the billing portal before changing plans.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if err == "paddle_lookup_failed":
        return error_response(
            code="BILLING_PADDLE_LOOKUP_FAILED",
            message="Could not load subscription from Paddle. Try again shortly.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if err == "paddle_error" or not result:
        return error_response(
            code="BILLING_CHANGE_PLAN_FAILED",
            message="Could not change plan. Try again or use the billing portal.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return success_response(data=result)


@router.post("/customer-portal")
def create_customer_portal_session(
    current_user: User = Depends(get_current_user),
    _csrf: None = Depends(require_csrf_for_cookie_auth),
    db: Session = Depends(get_db),
):
    """
    Open Paddle's hosted customer portal (authenticated session).
    Deep-links to subscription cancellation when a Paddle subscription id is stored.
    """
    billing = BillingService(db)
    result, err = billing.create_customer_portal_session(current_user.id)
    if err == "paddle_not_configured":
        return error_response(
            code="BILLING_PORTAL_UNAVAILABLE",
            message="Billing portal is temporarily unavailable.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if err == "no_billing_customer":
        return error_response(
            code="BILLING_PORTAL_NO_CUSTOMER",
            message="No Paddle billing profile found for this account. Subscribe first or contact support.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    if err == "paddle_error" or not result or not result.get("url"):
        return error_response(
            code="BILLING_PORTAL_FAILED",
            message="Could not open the billing portal. Try again or contact support.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return success_response(data=result)


@router.post("/webhook")
@router.post("/webhook/paddle")
async def handle_paddle_webhook(
    request: Request,
    paddle_signature: Optional[str] = Header(default=None, alias="Paddle-Signature"),
    db: Session = Depends(get_db),
):
    payload = await request.body()
    result = BillingService(db).handle_paddle_webhook(payload, paddle_signature or "")
    if result.get("error"):
        return error_response(
            code="BILLING_WEBHOOK_INVALID",
            message=str(result["error"]),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    return success_response(data=result)


@router.post("/webhook/retry/{event_id}")
def retry_paddle_webhook_event(
    event_id: str,
    current_user: User = Depends(get_current_superuser),
    _csrf: None = Depends(require_csrf_for_cookie_auth),
    db: Session = Depends(get_db),
):
    _ = current_user
    result = BillingService(db).retry_failed_webhook_event(event_id)
    if result.get("status") == "error":
        return error_response(
            code=str(result.get("code") or "BILLING_RETRY_FAILED"),
            message=str(result.get("message") or "Retry failed"),
            status_code=status.HTTP_404_NOT_FOUND
            if str(result.get("code")) == "BILLING_EVENT_NOT_FOUND"
            else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return success_response(data=result)


@router.post("/reconcile")
def reconcile_billing_subscriptions(
    limit: int = 200,
    current_user: User = Depends(get_current_superuser),
    _csrf: None = Depends(require_csrf_for_cookie_auth),
    db: Session = Depends(get_db),
):
    _ = current_user
    result = BillingService(db).reconcile_paddle_subscriptions(limit=limit)
    return success_response(data=result)


@router.post("/reconcile/users/{user_id}")
def reconcile_billing_subscription_for_user(
    user_id: int,
    current_user: User = Depends(get_current_superuser),
    _csrf: None = Depends(require_csrf_for_cookie_auth),
    db: Session = Depends(get_db),
):
    _ = current_user
    result = BillingService(db).reconcile_paddle_subscription_for_user(user_id)
    return success_response(data=result)


@router.get("/timeline/users/{user_id}")
def get_billing_timeline_for_user(
    user_id: int,
    limit: int = 20,
    current_user: User = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    _ = current_user
    result, err = BillingService(db).get_billing_timeline_for_user(user_id, event_limit=limit)
    if err == "user_not_found":
        return error_response(
            code="BILLING_TIMELINE_USER_NOT_FOUND",
            message="User not found.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    if not result:
        return error_response(
            code="BILLING_TIMELINE_UNAVAILABLE",
            message="Could not load billing timeline.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return success_response(data=result)
