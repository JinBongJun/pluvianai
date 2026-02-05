"""
Test run limit checks (input_prompts_per_test, total_calls_per_single_test).
Used by Replay and Regression (and future Chain run) endpoints.
"""

from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.services.subscription_service import SubscriptionService
from app.core.subscription_limits import PLAN_LIMITS
from app.models.test_run import TestRun
from app.models.replay_run import ReplayRun
from app.models.project import Project


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


def check_concurrent_test_runs(
    db: Session,
    user_id: int,
) -> None:
    """
    Enforce per-user concurrent test run limits across Replay and Test Lab.

    Looks up the current subscription plan's `concurrent_tests_per_project` and
    counts running `TestRun` and `ReplayRun` rows for projects owned by the user.
    Raises HTTP 403 with code CONCURRENT_TEST_NOT_ALLOWED when the limit is hit.
    """
    service = SubscriptionService(db)
    plan_info = service.get_user_plan(user_id)
    plan_type = plan_info["plan_type"]
    limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

    concurrent_limit = limits.get("concurrent_tests_per_project", 1)
    # A non-positive limit is treated as "no limit" for safety.
    if concurrent_limit <= 0:
        return

    running_test_lab = (
        db.query(TestRun)
        .join(Project, Project.id == TestRun.project_id)
        .filter(Project.owner_id == user_id, TestRun.status == "running")
        .count()
    )

    running_replay = (
        db.query(ReplayRun)
        .join(Project, Project.id == ReplayRun.project_id)
        .filter(Project.owner_id == user_id, ReplayRun.status == "running")
        .count()
    )

    current_running = running_test_lab + running_replay

    if current_running >= concurrent_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": (
                    f"동시에 실행할 수 있는 테스트는 최대 {concurrent_limit}개입니다. "
                    "현재 다른 테스트가 실행 중입니다."
                ),
                "code": "CONCURRENT_TEST_NOT_ALLOWED",
                "limit": concurrent_limit,
                "current": current_running,
            },
        )
