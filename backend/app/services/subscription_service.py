"""
Subscription service for managing user plans, limits, and usage
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.user import User
from app.models.subscription import Subscription
from app.models.usage import Usage
from app.core.subscription_limits import PLAN_LIMITS, PLAN_PRICING


class SubscriptionService:
    """Service for subscription management and usage tracking"""

    def __init__(self, db: Session):
        self.db = db

    def get_user_plan(self, user_id: int) -> Dict[str, Any]:
        """Get user's current plan details, limits, and enabled features"""
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()

        # Default to free plan if no subscription exists
        plan_type = subscription.plan_type if subscription else "free"
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        return {
            "plan_type": plan_type,
            "status": subscription.status if subscription else "active",
            "price_per_month": PLAN_PRICING.get(plan_type, 0),
            "limits": {
                "projects": limits["projects"],
                "api_calls_per_month": limits["api_calls_per_month"],
                "team_members_per_project": limits["team_members_per_project"],
                "data_retention_days": limits["data_retention_days"],
            },
            "features": limits["features"],
            "current_period_start": (
                subscription.current_period_start.isoformat()
                if subscription and subscription.current_period_start
                else None
            ),
            "current_period_end": (
                subscription.current_period_end.isoformat()
                if subscription and subscription.current_period_end
                else None
            ),
            "trial_end": subscription.trial_end.isoformat() if subscription and subscription.trial_end else None,
        }

    def check_usage_limit(self, user_id: int, metric_type: str, amount: int = 1) -> Tuple[bool, Optional[str]]:
        """
        Check if user can perform an operation without exceeding limits
        Returns: (is_allowed, error_message)
        """
        plan_info = self.get_user_plan(user_id)
        plan_type = plan_info["plan_type"]
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        # Get current usage for this metric
        now = datetime.utcnow()
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            period_end = period_start.replace(year=now.year + 1, month=1)
        else:
            period_end = period_start.replace(month=now.month + 1)

        usage = (
            self.db.query(Usage)
            .filter(
                and_(Usage.user_id == user_id, Usage.metric_type == metric_type, Usage.period_start == period_start)
            )
            .first()
        )

        current_usage = usage.current_usage if usage else 0
        limit = limits.get(f"{metric_type}_per_month")

        # Handle unlimited (-1)
        if limit == -1:
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

    def increment_usage(
        self, user_id: int, metric_type: str, amount: int = 1, project_id: Optional[int] = None
    ) -> None:
        """Increment usage counter for a metric"""
        now = datetime.utcnow()
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            period_end = period_start.replace(year=now.year + 1, month=1)
        else:
            period_end = period_start.replace(month=now.month + 1)

        usage = (
            self.db.query(Usage)
            .filter(
                and_(
                    Usage.user_id == user_id,
                    Usage.metric_type == metric_type,
                    Usage.period_start == period_start,
                    Usage.project_id == project_id,
                )
            )
            .first()
        )

        if usage:
            usage.current_usage += amount
            usage.updated_at = now
        else:
            # Get limit from plan
            plan_info = self.get_user_plan(user_id)
            plan_type = plan_info["plan_type"]
            limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])
            limit = limits.get(f"{metric_type}_per_month", -1)

            usage = Usage(
                user_id=user_id,
                project_id=project_id,
                metric_type=metric_type,
                current_usage=amount,
                limit=limit,
                period_start=period_start,
                period_end=period_end,
            )
            self.db.add(usage)

        self.db.commit()

    def get_usage_summary(self, user_id: int) -> Dict[str, Any]:
        """Get current usage vs limits for all metrics"""
        plan_info = self.get_user_plan(user_id)
        plan_type = plan_info["plan_type"]
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        now = datetime.utcnow()
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            period_end = period_start.replace(year=now.year + 1, month=1)
        else:
            period_end = period_start.replace(month=now.month + 1)

        # Get all usage records for current period
        usage_records = (
            self.db.query(Usage).filter(and_(Usage.user_id == user_id, Usage.period_start == period_start)).all()
        )

        # Aggregate usage by metric type
        usage_by_metric: Dict[str, int] = {}
        for record in usage_records:
            if record.metric_type not in usage_by_metric:
                usage_by_metric[record.metric_type] = 0
            usage_by_metric[record.metric_type] += record.current_usage

        # Build summary
        summary = {"period_start": period_start.isoformat(), "period_end": period_end.isoformat(), "metrics": {}}

        # Add metrics from plan limits
        for key, limit in limits.items():
            if key.endswith("_per_month"):
                metric_type = key.replace("_per_month", "")
                current = usage_by_metric.get(metric_type, 0)
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
        Returns number of records reset
        """
        # This should be called by a scheduled task (e.g., Celery, cron)
        # For now, just return 0 - implementation depends on background job system
        return 0

    def create_or_update_subscription(
        self,
        user_id: int,
        plan_type: str,
        status: str = "active",
        paddle_subscription_id: Optional[str] = None,
        paddle_customer_id: Optional[str] = None,
        price_per_month: Optional[float] = None,
    ) -> Subscription:
        """Create or update user subscription"""
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()

        now = datetime.utcnow()
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            period_end = period_start.replace(year=now.year + 1, month=1)
        else:
            period_end = period_start.replace(month=now.month + 1)

        if subscription:
            subscription.plan_type = plan_type
            subscription.status = status
            subscription.current_period_start = period_start
            subscription.current_period_end = period_end
            if paddle_subscription_id:
                subscription.paddle_subscription_id = paddle_subscription_id
            if paddle_customer_id:
                subscription.paddle_customer_id = paddle_customer_id
            if price_per_month is not None:
                subscription.price_per_month = price_per_month
            subscription.updated_at = now
        else:
            subscription = Subscription(
                user_id=user_id,
                plan_type=plan_type,
                status=status,
                current_period_start=period_start,
                current_period_end=period_end,
                paddle_subscription_id=paddle_subscription_id,
                paddle_customer_id=paddle_customer_id,
                price_per_month=price_per_month or PLAN_PRICING.get(plan_type, 0),
            )
            self.db.add(subscription)

        self.db.commit()
        self.db.refresh(subscription)
        return subscription
