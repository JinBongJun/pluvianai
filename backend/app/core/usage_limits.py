"""
Usage limits (DB-backed, no Redis dependency for enforcement).

Paid plans: quota window follows the active subscription billing period when
`current_period_start` / `current_period_end` are set (plus roll-forward if
provider sync is late).
Free / no subscription: quota window follows a monthly anniversary anchor based
on `subscriptions.free_usage_anchor_at` with `users.created_at` as fallback.
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_config import logger
from app.core.subscription_limits import PLAN_LIMITS, normalize_plan_type
from app.models.organization import Organization
from app.models.project import Project
from app.models.snapshot import Snapshot
from app.models.subscription import Subscription
from app.models.user import User
from app.models.usage import Usage


@dataclass(frozen=True)
class UsageWindow:
    period_start: datetime
    period_end: datetime
    next_reset_at: datetime
    window_type: str
    anchor_source: str


def _ensure_utc_aware(dt: datetime) -> datetime:
    """DB may return naive datetimes; all quota math uses UTC-aware instants."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _calendar_month_bounds_utc() -> Tuple[datetime, datetime]:
    """Return (start, end) of current calendar month in UTC (inclusive end for queries)."""
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    _, last_day = monthrange(now.year, now.month)
    end = start.replace(day=last_day, hour=23, minute=59, second=59, microsecond=999_999)
    return start, end


def _month_anchor_occurrence(anchor: datetime, month_offset: int) -> datetime:
    total_months = (anchor.year * 12 + (anchor.month - 1)) + month_offset
    year = total_months // 12
    month = (total_months % 12) + 1
    day = min(anchor.day, monthrange(year, month)[1])
    return anchor.replace(year=year, month=month, day=day)


def get_anniversary_monthly_bounds_utc(
    anchor: datetime, *, now: datetime | None = None
) -> Tuple[datetime, datetime]:
    """
    Return the inclusive current monthly window for an account anchor.

    Example: an anchor of Mar 12 15:30 UTC yields windows such as
    Mar 12 15:30 -> Apr 12 15:29:59.999999, then Apr 12 15:30 -> May 12 ...
    """
    anchor = _ensure_utc_aware(anchor)
    current_time = _ensure_utc_aware(now or datetime.now(timezone.utc))
    month_delta = (current_time.year - anchor.year) * 12 + (current_time.month - anchor.month)
    start = _month_anchor_occurrence(anchor, month_delta)
    if start > current_time:
        month_delta -= 1
        start = _month_anchor_occurrence(anchor, month_delta)
    next_start = _month_anchor_occurrence(anchor, month_delta + 1)
    end = next_start - timedelta(microseconds=1)
    return start, end


def _roll_forward_billing_window(
    period_start: datetime, period_end: datetime, now: datetime
) -> Tuple[datetime, datetime]:
    """Project current period when DB still holds the previous cycle (delayed webhook)."""
    duration = period_end - period_start
    if duration <= timedelta(0):
        return _calendar_month_bounds_utc()
    cur_s, cur_e = period_start, period_end
    for _ in range(48):
        if cur_s <= now <= cur_e:
            return cur_s, cur_e
        if now < cur_s:
            return cur_s, cur_e
        cur_s = cur_e + timedelta(microseconds=1)
        cur_e = cur_s + duration
    return _calendar_month_bounds_utc()


def get_usage_window(db: Session, user_id: int) -> UsageWindow:
    """Resolve the current usage window for billing and quota enforcement."""
    now = datetime.now(timezone.utc)
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    plan_type = normalize_plan_type(sub.plan_type if sub else "free")
    status = str(getattr(sub, "status", "active") or "active").strip().lower()
    if status == "canceled":
        status = "cancelled"

    ps = _ensure_utc_aware(sub.current_period_start) if sub and sub.current_period_start else None
    pe = _ensure_utc_aware(sub.current_period_end) if sub and sub.current_period_end else None
    is_expired_paid = plan_type != "free" and status == "cancelled" and pe is not None and pe <= now

    if sub and plan_type != "free" and not is_expired_paid and ps is not None and pe is not None:
        if ps <= now <= pe:
            period_start, period_end = ps, pe
        elif now > pe:
            period_start, period_end = _roll_forward_billing_window(ps, pe, now)
        else:
            period_start, period_end = ps, pe
        return UsageWindow(
            period_start=period_start,
            period_end=period_end,
            next_reset_at=period_end + timedelta(microseconds=1),
            window_type="billing_period",
            anchor_source="subscription.current_period",
        )

    user = db.query(User).filter(User.id == user_id).first()
    anchor = None
    anchor_source = "calendar_month_fallback"
    if sub and getattr(sub, "free_usage_anchor_at", None) is not None:
        anchor = _ensure_utc_aware(sub.free_usage_anchor_at)
        anchor_source = "subscription.free_usage_anchor_at"
    elif user and getattr(user, "created_at", None) is not None:
        anchor = _ensure_utc_aware(user.created_at)
        anchor_source = "user.created_at"

    if anchor is not None:
        period_start, period_end = get_anniversary_monthly_bounds_utc(anchor, now=now)
        return UsageWindow(
            period_start=period_start,
            period_end=period_end,
            next_reset_at=period_end + timedelta(microseconds=1),
            window_type="anniversary_monthly",
            anchor_source=anchor_source,
        )

    period_start, period_end = _calendar_month_bounds_utc()
    return UsageWindow(
        period_start=period_start,
        period_end=period_end,
        next_reset_at=period_end + timedelta(microseconds=1),
        window_type="calendar_month",
        anchor_source=anchor_source,
    )


def get_usage_period_bounds_utc(db: Session, user_id: int) -> Tuple[datetime, datetime]:
    """Backward-compatible bounds accessor for the current usage window."""
    window = get_usage_window(db, user_id)
    return window.period_start, window.period_end


def _coerce_bound_for_db(db: Session, dt: datetime) -> Any:
    if getattr(getattr(db, "bind", None), "dialect", None) is not None:
        if db.bind.dialect.name == "sqlite":
            naive = dt.astimezone(timezone.utc).replace(tzinfo=None)
            return naive.isoformat(sep=" ", timespec="microseconds").rstrip("0").rstrip(".")
    return dt


def get_usage_period_query_bounds(db: Session, user_id: int) -> Tuple[datetime, datetime]:
    """Return bounds normalized for the active database dialect."""
    start, end = get_usage_period_bounds_utc(db, user_id)
    return _coerce_bound_for_db(db, start), _coerce_bound_for_db(db, end)


def _sum_usage_metric_this_period(db: Session, user_id: int, metric_name: str) -> int:
    start, end = get_usage_period_query_bounds(db, user_id)
    row = (
        db.query(func.coalesce(func.sum(Usage.quantity), 0))
        .filter(
            Usage.user_id == user_id,
            Usage.metric_name == metric_name,
            Usage.timestamp >= start,
            Usage.timestamp <= end,
        )
        .first()
    )
    return int(row[0]) if row and row[0] is not None else 0


def get_legacy_snapshots_count_this_month(db: Session, user_id: int) -> int:
    """Legacy snapshot row count for migration compare/backfill."""
    start, end = get_usage_period_query_bounds(db, user_id)
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


def ensure_snapshot_usage_backfill_current_window(db: Session, user_id: int) -> int:
    """Backfill the active usage window from legacy snapshot rows once per window."""
    ledger_count = _sum_usage_metric_this_period(db, user_id, "snapshots")
    if not settings.FEATURE_FLAG_SNAPSHOT_USAGE_LEDGER_BACKFILL_ON_READ:
        return ledger_count

    legacy_count = get_legacy_snapshots_count_this_month(db, user_id)
    diff = max(0, legacy_count - ledger_count)
    if diff <= 0:
        return ledger_count

    window = get_usage_window(db, user_id)
    window_token = f"{int(window.period_start.timestamp())}:{int(window.period_end.timestamp())}"
    idempotency_key = f"snapshot-backfill:{user_id}:{window_token}"

    from app.services.subscription_service import SubscriptionService

    SubscriptionService(db).append_usage(
        user_id=user_id,
        metric_type="snapshots",
        amount=diff,
        source_type="snapshot_backfill_window",
        source_id=window_token,
        idempotency_key=idempotency_key,
        timestamp=window.period_start,
        commit=False,
    )
    logger.info(
        "Backfilled snapshot usage for user %s window %s with delta=%s",
        user_id,
        window_token,
        diff,
    )
    return ledger_count + diff


def get_snapshots_count_this_month(db: Session, user_id: int) -> int:
    """
    Count snapshots in the current usage window using the durable usage ledger.
    """
    ledger_count = ensure_snapshot_usage_backfill_current_window(db, user_id)
    legacy_count = None
    if settings.FEATURE_FLAG_SNAPSHOT_USAGE_LEDGER_SHADOW_COMPARE:
        legacy_count = get_legacy_snapshots_count_this_month(db, user_id)
        if legacy_count != ledger_count:
            logger.warning(
                "Snapshot usage drift detected for user %s: ledger=%s legacy=%s",
                user_id,
                ledger_count,
                legacy_count,
            )
    if settings.FEATURE_FLAG_SNAPSHOT_USAGE_LEDGER:
        return ledger_count
    return legacy_count if legacy_count is not None else get_legacy_snapshots_count_this_month(db, user_id)


def get_guard_credits_this_month(db: Session, user_id: int) -> int:
    """
    Sum hosted replay credits (guard_credits_replay) in the current usage window.
    """
    return _sum_usage_metric_this_period(db, user_id, "guard_credits_replay")


def get_platform_replay_credits_this_month(db: Session, user_id: int) -> int:
    """Explicit alias for hosted replay credit usage."""
    return get_guard_credits_this_month(db, user_id)


def get_release_gate_attempts_this_month(db: Session, user_id: int) -> int:
    """
    Sum replay attempts (selected snapshots x repeats) in the current usage window.
    """
    return _sum_usage_metric_this_period(db, user_id, "release_gate_attempts")


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
    Metrics: organizations | projects | snapshots | platform_replay_credits | release_gate_attempts
    """
    plan_type = _resolve_user_plan_type(db, user_id)
    limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])
    if db is not None:
        window = get_usage_window(db, user_id)
        end = window.period_end
        next_reset_at = window.next_reset_at.isoformat()
        window_type = window.window_type
    else:
        _, end = _calendar_month_bounds_utc()
        next_reset_at = end.isoformat()
        window_type = "calendar_month"
    reset_at = next_reset_at

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
    elif metric == "release_gate_attempts":
        cap = limits.get("release_gate_attempts_per_month")
        limit = int(cap) if cap is not None else -1
        current = int(get_release_gate_attempts_this_month(db, user_id)) if db is not None else 0
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
        "window_type": window_type,
    }


def check_snapshot_limit(
    db: Session, user_id: int, amount: int = 1, is_superuser: bool = False
) -> Tuple[bool, str | None]:
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
    if current + amount > cap:
        return (
            False,
            f"Snapshot limit reached: {current} / {cap} for this billing period. Upgrade or wait until the period resets.",
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
            "You have used all included platform replay credits for this billing period. Switch to your own provider key or upgrade your plan to keep running Release Gate.",
        )
    return (True, None)


def check_platform_replay_credits_limit(
    db: Session, user_id: int, is_superuser: bool = False
) -> Tuple[bool, str | None]:
    """Explicit alias for hosted replay credit checks."""
    return check_guard_credits_limit(db, user_id, is_superuser)


def check_release_gate_attempts_limit(
    db: Session, user_id: int, amount: int, is_superuser: bool = False
) -> Tuple[bool, str | None]:
    """
    Returns (allowed, error_message). Usage is counted by replay attempt:
    selected snapshots multiplied by repeat count.
    """
    if is_superuser:
        return (True, None)
    limits = _get_user_plan_limits(db, user_id)
    cap = limits.get("release_gate_attempts_per_month")
    if cap is None or cap == -1:
        return (True, None)
    current = get_release_gate_attempts_this_month(db, user_id)
    if current + amount > cap:
        return (
            False,
            "You have used all included Release Gate usage for this billing period. "
            "Usage is counted by replay attempt (selected logs x repeats). Upgrade your plan to keep running Release Gate.",
        )
    return (True, None)
