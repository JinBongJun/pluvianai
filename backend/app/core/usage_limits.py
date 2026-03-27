"""
Helpers for free-tier usage limits (DB-backed, no Redis dependency for enforcement).
Used by snapshot creation, hosted Release Gate replay credits, and usage APIs.
"""

from calendar import monthrange
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.subscription_limits import PLAN_LIMITS, normalize_plan_type
from app.models.organization import Organization
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
    Sum of hosted replay credits (metric_name='guard_credits_replay') for this user this month.
    Used for free-tier platform replay credit enforcement.
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


def get_platform_replay_credits_this_month(db: Session, user_id: int) -> int:
    """Explicit alias for hosted replay credit usage."""
    return get_guard_credits_this_month(db, user_id)


def _resolve_user_plan_type(db: Session | None, user_id: int) -> str:
    """Resolve canonical plan type for a user from subscription row."""
    if db is None:
        return "free"
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if sub:
        raw_plan = getattr(sub, "plan_type", None) or getattr(sub, "plan_id", None) or "free"
    else:
        raw_plan = "free"
    plan_type = normalize_plan_type(raw_plan)
    return plan_type


def _get_user_plan_limits(db: Session | None, user_id: int) -> dict:
    """Resolve plan limits for user from canonical plan type."""
    plan_type = _resolve_user_plan_type(db, user_id)
    return PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])


def get_limit_status(db: Session | None, user_id: int, metric: str) -> Dict[str, Any]:
    """
    Return a normalized limit status payload for limit-aware APIs/UI.
    Metrics: organizations | projects | snapshots | platform_replay_credits
    """
    plan_type = _resolve_user_plan_type(db, user_id)
    limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])
    _, end = _current_month_bounds_utc()
    reset_at = end.isoformat()

    if metric == "snapshots":
        limit = int(limits.get("snapshots_per_month", 10_000))
        current = int(get_snapshots_count_this_month(db, user_id)) if db is not None else 0
    elif metric == "organizations":
        limit = int(limits.get("organizations", 1))
        current = (
            int(
                db.query(Organization)
                .filter(
                    Organization.owner_id == user_id,
                    Organization.is_deleted.is_(False),
                )
                .count()
            )
            if db is not None
            else 0
        )
    elif metric == "projects":
        limit = int(limits.get("projects", 1))
        current = (
            int(
                db.query(Project)
                .filter(
                    Project.owner_id == user_id,
                    Project.is_active.is_(True),
                    Project.is_deleted.is_(False),
                )
                .count()
            )
            if db is not None
            else 0
        )
    elif metric == "platform_replay_credits":
        cap = limits.get("platform_replay_credits_per_month", limits.get("guard_credits_per_month"))
        limit = int(cap) if cap is not None else -1
        current = int(get_platform_replay_credits_this_month(db, user_id)) if db is not None else 0
    else:
        raise ValueError(f"Unsupported metric for limit status: {metric}")

    remaining = -1 if limit == -1 else max(0, limit - current)
    return {
        "plan_type": plan_type,
        "metric": metric,
        "current": current,
        "limit": limit,
        "remaining": remaining,
        "reset_at": reset_at,
    }


def check_snapshot_limit(db: Session, user_id: int, is_superuser: bool = False) -> Tuple[bool, str | None]:
    """
    Returns (allowed, error_message). If not allowed, error_message is the 403 detail.
    """
    if is_superuser:
        return (True, None)
    limits = _get_user_plan_limits(db, user_id)
    cap = limits.get("snapshots_per_month", 10_000)
    if cap == -1:
        return (True, None)
    current = get_snapshots_count_this_month(db, user_id)
    if current + 1 > cap:
        return (
            False,
            f"Snapshot limit reached: {current} / {cap} this month. Upgrade or wait for monthly reset.",
        )
    return (True, None)


def check_guard_credits_limit(db: Session, user_id: int, is_superuser: bool = False) -> Tuple[bool, str | None]:
    """
    Returns (allowed, error_message). If not allowed, error_message is the 403 detail.
    """
    if is_superuser:
        return (True, None)
    limits = _get_user_plan_limits(db, user_id)
    cap = limits.get("platform_replay_credits_per_month", limits.get("guard_credits_per_month"))
    if cap is None or cap == -1:
        return (True, None)
    current = get_platform_replay_credits_this_month(db, user_id)
    if current >= cap:
        return (
            False,
            "You have used all included platform replay credits for this month. Switch to your own provider key or upgrade your plan to keep running Release Gate.",
        )
    return (True, None)


def check_platform_replay_credits_limit(
    db: Session, user_id: int, is_superuser: bool = False
) -> Tuple[bool, str | None]:
    """Explicit alias for hosted replay credit checks."""
    return check_guard_credits_limit(db, user_id, is_superuser)
