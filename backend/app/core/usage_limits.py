"""
Helpers for free-tier usage limits (DB-backed, no Redis dependency for enforcement).
Used by snapshot creation, replay (GuardCredits), and usage API.
"""

from calendar import monthrange
from datetime import datetime, timezone
from typing import Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.subscription_limits import PLAN_LIMITS
from app.models.project import Project
from app.models.snapshot import Snapshot
from app.models.subscription import Subscription
from app.models.usage import Usage


def _current_month_bounds_utc() -> Tuple[datetime, datetime]:
    """Return (start, end) of current month in UTC (end is exclusive)."""
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    _, last_day = monthrange(now.year, now.month)
    end = start.replace(day=last_day, hour=23, minute=59, second=59, microsecond=999_999)
    return start, end


def get_snapshots_count_this_month(db: Session, user_id: int) -> int:
    """
    Count snapshots created this month in projects owned by this user.
    Used for free-tier snapshots_per_month enforcement.
    """
    start, end = _current_month_bounds_utc()
    count = (
        db.query(Snapshot.id)
        .join(Project, Snapshot.project_id == Project.id)
        .filter(
            Project.owner_id == user_id,
            Snapshot.created_at >= start,
            Snapshot.created_at <= end,
        )
        .count()
    )
    return count or 0


def get_guard_credits_this_month(db: Session, user_id: int) -> int:
    """
    Sum of GuardCredits (metric_name='guard_credits_replay') for this user this month.
    Used for free-tier guard_credits_per_month enforcement.
    """
    start, end = _current_month_bounds_utc()
    row = (
        db.query(func.coalesce(func.sum(Usage.quantity), 0))
        .filter(
            Usage.user_id == user_id,
            Usage.metric_name == "guard_credits_replay",
            Usage.timestamp >= start,
            Usage.timestamp <= end,
        )
        .first()
    )
    return int(row[0]) if row and row[0] is not None else 0


def _get_user_plan_limits(db: Session, user_id: int) -> dict:
    """Resolve plan limits for user from Subscription (plan_id = plan_type)."""
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    plan_type = (sub.plan_id or "free") if sub else "free"
    return PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])


def check_snapshot_limit(db: Session, user_id: int, is_superuser: bool = False) -> Tuple[bool, str | None]:
    """
    Returns (allowed, error_message). If not allowed, error_message is the 403 detail.
    """
    if is_superuser:
        return (True, None)
    limits = _get_user_plan_limits(db, user_id)
    cap = limits.get("snapshots_per_month", 500)
    if cap == -1:
        return (True, None)
    current = get_snapshots_count_this_month(db, user_id)
    if current + 1 > cap:
        return (
            False,
            f"Free plan limit: {cap} snapshots per month. You've reached the limit. Upgrade or try again next month.",
        )
    return (True, None)


def check_guard_credits_limit(db: Session, user_id: int, is_superuser: bool = False) -> Tuple[bool, str | None]:
    """
    Returns (allowed, error_message). If not allowed, error_message is the 403 detail.
    """
    if is_superuser:
        return (True, None)
    limits = _get_user_plan_limits(db, user_id)
    cap = limits.get("guard_credits_per_month")
    if cap is None or cap == -1:
        return (True, None)
    current = get_guard_credits_this_month(db, user_id)
    if current >= cap:
        return (
            False,
            "Free plan monthly GuardCredit limit reached. Connect your own API key for more runs, or try again next month.",
        )
    return (True, None)
