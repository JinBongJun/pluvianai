"""
Test run limit checks (input_prompts_per_test, total_calls_per_single_test).
Used by Replay and Regression (and future Chain run) endpoints.
"""

from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.services.subscription_service import SubscriptionService
from app.core.subscription_limits import PLAN_LIMITS


def check_test_run_limits(
    db: Session,
    user_id: int,
    input_count: int,
    estimated_calls: int,
) -> None:
    """
    Raise HTTP 403 if input_count or estimated_calls exceed plan limits.
    Call before running Replay, Regression, or Chain test.
    """
    service = SubscriptionService(db)
    plan_info = service.get_user_plan(user_id)
    plan_type = plan_info["plan_type"]
    limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

    input_limit = limits.get("input_prompts_per_test", 50)
    calls_limit = limits.get("total_calls_per_single_test", 1000)

    if input_count > input_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": (
                    f"Input limit exceeded. Your plan allows up to {input_limit} inputs per test (requested: {input_count}). Upgrade to run larger tests."
                ),
                "code": "LIMIT_INPUTS_PER_TEST",
                "limit": input_limit,
                "requested": input_count,
            },
        )

    if estimated_calls > calls_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": (
                    f"Estimated calls ({estimated_calls}) exceed your plan limit ({calls_limit}) per test. Upgrade to run this test."
                ),
                "code": "LIMIT_TOTAL_CALLS_PER_TEST",
                "limit": calls_limit,
                "requested": estimated_calls,
            },
        )
