"""
Subscription service for managing user plans, limits, and usage
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from app.models.user import User
from app.models.subscription import Subscription
from app.models.usage import Usage
from app.core.subscription_limits import PLAN_LIMITS, PLAN_PRICING, normalize_plan_type
from app.core.usage_limits import (
    get_anniversary_monthly_bounds_utc,
    get_usage_period_query_bounds,
    get_usage_window,
)
from app.core.logging_config import logger


class SubscriptionService:
    """Service for subscription management and usage tracking"""

    def __init__(self, db: Session):
        self.db = db

    def _usage_metric_name(self, metric_type: str) -> str:
        normalized = str(metric_type or "").strip().lower()
        # Keep compatibility with existing metric names already used elsewhere.
        mapping = {
            "api_calls": "api_calls",
            "snapshots": "snapshots",
            "judge_calls": "judge_calls",
            "release_gate_attempts": "release_gate_attempts",
            "guard_credits": "guard_credits_replay",
            "platform_replay_credits": "guard_credits_replay",
        }
        return mapping.get(normalized, normalized)

    def get_user_plan(self, user_id: int) -> Dict[str, Any]:
        """Get user's current plan details, limits, and enabled features"""
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        usage_window = get_usage_window(self.db, user_id)

        # Default to free plan if no subscription exists
        now = datetime.now(timezone.utc)
        status = str(subscription.status if subscription else "active").strip().lower()
        if status == "canceled":
            status = "cancelled"

        plan_type = normalize_plan_type(subscription.plan_type if subscription else "free")
        if subscription and status in {"cancelled", "free"}:
            period_end = subscription.current_period_end
            if period_end is not None and period_end.tzinfo is None:
                period_end = period_end.replace(tzinfo=timezone.utc)
            if status == "free" or (period_end is not None and period_end <= now):
                plan_type = "free"
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        return {
            "plan_type": plan_type,
            "status": status,
            "price_per_month": PLAN_PRICING.get(plan_type, 0),
            "limits": {
                "organizations": limits["organizations"],
                "projects": limits["projects"],
                "api_calls_per_month": limits["api_calls_per_month"],
                "team_members_per_project": limits["team_members_per_project"],
                "data_retention_days": limits["data_retention_days"],
                "snapshots_per_month": limits.get("snapshots_per_month"),
                "release_gate_attempts_per_month": limits.get("release_gate_attempts_per_month"),
                "guard_credits_per_month": limits.get("guard_credits_per_month"),
                "platform_replay_credits_per_month": limits.get(
                    "platform_replay_credits_per_month", limits.get("guard_credits_per_month")
                ),
            },
            "features": limits["features"],
            "current_period_start": usage_window.period_start.isoformat(),
            "current_period_end": usage_window.period_end.isoformat(),
            "usage_window_type": usage_window.window_type,
            "next_reset_at": usage_window.next_reset_at.isoformat(),
            "trial_end": subscription.trial_end.isoformat() if subscription and subscription.trial_end else None,
        }

    def check_usage_limit(self, user_id: int, metric_type: str, amount: int = 1) -> Tuple[bool, Optional[str]]:
        """
        Check if user can perform an operation without exceeding limits
        Returns: (is_allowed, error_message)
        """
        plan_info = self.get_user_plan(user_id)
        plan_type = normalize_plan_type(plan_info["plan_type"])
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        current_usage = self.get_metric_usage_current_period(user_id, metric_type)
        limit = limits.get(f"{metric_type}_per_month")

        # Handle unlimited (-1)
        if limit is None or limit == -1:
            return (True, None)

        # Check if adding amount would exceed limit
        if current_usage + amount > limit:
            return (False, f"Limit exceeded: {current_usage + amount} / {limit} {metric_type}")

        return (True, None)

    def check_feature_access(self, user_id: int, feature_name: str) -> bool:
        """Check if user's plan has access to a specific feature"""
        plan_info = self.get_user_plan(user_id)
        features = plan_info.get("features", {})

        # Handle nested feature paths (e.g., "alerts.slack")
        if "." in feature_name:
            parts = feature_name.split(".")
            value = features
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    return False
            return bool(value) if value is not None else False

        return bool(features.get(feature_name, False))

    def get_metric_usage_current_period(self, user_id: int, metric_type: str) -> int:
        period_start, period_end = get_usage_period_query_bounds(self.db, user_id)
        metric_name = self._usage_metric_name(metric_type)
        current_usage = (
            self.db.query(func.coalesce(func.sum(Usage.quantity), 0))
            .filter(
                Usage.user_id == user_id,
                Usage.metric_name == metric_name,
                Usage.timestamp >= period_start,
                Usage.timestamp <= period_end,
            )
            .scalar()
            or 0
        )
        return int(current_usage)

    def append_usage(
        self,
        user_id: int,
        metric_type: str,
        amount: int = 1,
        project_id: Optional[int] = None,
        *,
        unit: str = "count",
        source_type: Optional[str] = None,
        source_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        timestamp: Optional[datetime] = None,
        commit: bool = True,
    ) -> Usage:
        """Append a durable usage event for a metric."""
        metric_name = self._usage_metric_name(metric_type)
        if idempotency_key:
            existing = (
                self.db.query(Usage)
                .filter(Usage.idempotency_key == str(idempotency_key))
                .first()
            )
            if existing is not None:
                return existing

        usage = Usage(
            user_id=user_id,
            project_id=project_id,
            metric_name=metric_name,
            quantity=int(amount),
            unit=unit,
            source_type=str(source_type) if source_type is not None else None,
            source_id=str(source_id) if source_id is not None else None,
            idempotency_key=str(idempotency_key) if idempotency_key is not None else None,
        )
        if timestamp is not None:
            usage.timestamp = timestamp
        self.db.add(usage)
        try:
            if commit:
                self.db.commit()
                self.db.refresh(usage)
            else:
                self.db.flush()
        except IntegrityError:
            self.db.rollback()
            if idempotency_key:
                existing = (
                    self.db.query(Usage)
                    .filter(Usage.idempotency_key == str(idempotency_key))
                    .first()
                )
                if existing is not None:
                    return existing
            raise
        return usage

    def increment_usage(
        self, user_id: int, metric_type: str, amount: int = 1, project_id: Optional[int] = None
    ) -> Usage:
        """Increment usage counter for a metric."""
        return self.append_usage(
            user_id=user_id,
            metric_type=metric_type,
            amount=amount,
            project_id=project_id,
            commit=True,
        )

    def get_usage_summary(self, user_id: int) -> Dict[str, Any]:
        """Get current usage vs limits for all metrics"""
        plan_info = self.get_user_plan(user_id)
        plan_type = plan_info["plan_type"]
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        usage_window = get_usage_window(self.db, user_id)
        query_period_start, query_period_end = get_usage_period_query_bounds(self.db, user_id)

        # Aggregate usage by metric_name for the current usage window.
        usage_by_metric: Dict[str, int] = {}
        usage_rows = (
            self.db.query(Usage.metric_name, func.coalesce(func.sum(Usage.quantity), 0).label("total"))
            .filter(
                Usage.user_id == user_id,
                Usage.timestamp >= query_period_start,
                Usage.timestamp <= query_period_end,
            )
            .group_by(Usage.metric_name)
            .all()
        )
        for metric_name, total in usage_rows:
            usage_by_metric[str(metric_name)] = int(total or 0)

        # Build summary
        summary = {
            "period_start": usage_window.period_start.isoformat(),
            "period_end": usage_window.period_end.isoformat(),
            "next_reset_at": usage_window.next_reset_at.isoformat(),
            "usage_window_type": usage_window.window_type,
            "metrics": {},
        }

        # Add metrics from plan limits
        for key, limit in limits.items():
            if key.endswith("_per_month"):
                metric_type = key.replace("_per_month", "")
                current = usage_by_metric.get(self._usage_metric_name(metric_type), 0)
                summary["metrics"][metric_type] = {
                    "current": current,
                    "limit": limit,
                    "percentage": (current / limit * 100) if limit > 0 else 0,
                    "unlimited": limit == -1,
                }

        return summary

    def reset_monthly_usage(self) -> int:
        """
        Background job to reset monthly usage counters
        Deletes all monthly usage keys from Redis (they will be recreated on next increment)
        Returns number of users processed
        """
        from app.services.cache_service import cache_service
        from app.models.user import User

        if not cache_service.enabled:
            logger.warning("Redis not available, cannot reset monthly usage")
            return 0
        
        try:
            # Get all users
            users = self.db.query(User).filter(User.is_active.is_(True)).all()
            reset_count = 0
            
            # Get current year-month for pattern matching
            now = datetime.now(timezone.utc)
            current_year_month = now.strftime("%Y-%m")
            
            # Delete monthly usage keys for all users
            for user in users:
                usage_window = get_usage_window(self.db, user.id)
                p_start, p_end = usage_window.period_start, usage_window.period_end
                period_tag = f"{int(p_start.timestamp())}_{int(p_end.timestamp())}"
                keys_to_delete = [
                    f"user:{user.id}:usage:monthly:{current_year_month}",
                    f"user:{user.id}:snapshots:monthly:{current_year_month}",
                    f"user:{user.id}:judge_calls:monthly:{current_year_month}",
                    f"user:{user.id}:usage:period:{period_tag}",
                    f"user:{user.id}:snapshots:period:{period_tag}",
                    f"user:{user.id}:judge_calls:period:{period_tag}",
                ]

                for key in keys_to_delete:
                    try:
                        cache_service.redis_client.delete(key)
                    except Exception as e:
                        logger.warning(f"Failed to delete key {key}: {str(e)}")
                
                reset_count += 1
            
            logger.info(f"Reset monthly usage for {reset_count} users")
            return reset_count
        except Exception as e:
            logger.error(f"Error resetting monthly usage: {str(e)}")
            return 0

    def create_or_update_subscription(
        self,
        user_id: int,
        plan_type: str,
        status: str = "active",
        paddle_subscription_id: Optional[str] = None,
        paddle_customer_id: Optional[str] = None,
        price_per_month: Optional[float] = None,
        current_period_start: Optional[datetime] = None,
        current_period_end: Optional[datetime] = None,
        provider: Optional[str] = None,
        provider_environment: Optional[str] = None,
        canceled_at: Optional[datetime] = None,
        cancel_effective_at: Optional[datetime] = None,
        last_provider_event_at: Optional[datetime] = None,
        last_reconciled_at: Optional[datetime] = None,
    ) -> Subscription:
        """Create or update user subscription"""
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        normalized_status = "cancelled" if str(status).strip().lower() == "canceled" else str(status).strip().lower()
        normalized_plan_type = normalize_plan_type(plan_type)

        now = datetime.now(timezone.utc)
        anchor_at = subscription.free_usage_anchor_at if subscription else None
        if normalized_plan_type == "free":
            if anchor_at is None or (subscription and normalize_plan_type(subscription.plan_type) != "free"):
                anchor_at = current_period_start or now

        # Use provided period dates or default to the active usage window.
        if current_period_start is not None:
            period_start = current_period_start
        elif subscription and subscription.current_period_start is not None:
            period_start = subscription.current_period_start
        elif normalized_plan_type == "free" and anchor_at is not None:
            period_start, _ = get_anniversary_monthly_bounds_utc(anchor_at, now=now)
        else:
            period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        if current_period_end is not None:
            period_end = current_period_end
        elif subscription and subscription.current_period_end is not None:
            period_end = subscription.current_period_end
        elif normalized_plan_type == "free" and anchor_at is not None:
            _, period_end = get_anniversary_monthly_bounds_utc(anchor_at, now=now)
        else:
            if now.month == 12:
                period_end = period_start.replace(year=now.year + 1, month=1)
            else:
                period_end = period_start.replace(month=now.month + 1)

        if subscription:
            subscription.plan_type = plan_type
            subscription.status = normalized_status
            subscription.free_usage_anchor_at = anchor_at
            subscription.current_period_start = period_start
            subscription.current_period_end = period_end
            if provider:
                subscription.provider = provider
            if provider_environment:
                subscription.provider_environment = provider_environment
            if paddle_subscription_id:
                subscription.paddle_subscription_id = paddle_subscription_id
            if paddle_customer_id:
                subscription.paddle_customer_id = paddle_customer_id
            if canceled_at is not None:
                subscription.canceled_at = canceled_at
            if cancel_effective_at is not None:
                subscription.cancel_effective_at = cancel_effective_at
            if last_provider_event_at is not None:
                subscription.last_provider_event_at = last_provider_event_at
            if last_reconciled_at is not None:
                subscription.last_reconciled_at = last_reconciled_at
            if price_per_month is not None:
                subscription.price_per_month = price_per_month
            subscription.updated_at = now
        else:
            subscription = Subscription(
                user_id=user_id,
                plan_type=plan_type,
                status=normalized_status,
                free_usage_anchor_at=anchor_at,
                current_period_start=period_start,
                current_period_end=period_end,
                paddle_subscription_id=paddle_subscription_id,
                paddle_customer_id=paddle_customer_id,
                provider=provider or "paddle",
                provider_environment=provider_environment or "unknown",
                canceled_at=canceled_at,
                cancel_effective_at=cancel_effective_at,
                last_provider_event_at=last_provider_event_at,
                last_reconciled_at=last_reconciled_at,
                price_per_month=price_per_month or PLAN_PRICING.get(plan_type, 0),
            )
            self.db.add(subscription)

        self.db.commit()
        self.db.refresh(subscription)
        return subscription
