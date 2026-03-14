"""
Subscription service for managing user plans, limits, and usage
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.user import User
from app.models.subscription import Subscription
from app.models.usage import Usage
from app.core.subscription_limits import PLAN_LIMITS, PLAN_PRICING, normalize_plan_type
from app.core.logging_config import logger


class SubscriptionService:
    """Service for subscription management and usage tracking"""

    def __init__(self, db: Session):
        self.db = db

    def _period_bounds(self, now: datetime) -> tuple[datetime, datetime]:
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            period_end = period_start.replace(year=now.year + 1, month=1)
        else:
            period_end = period_start.replace(month=now.month + 1)
        return period_start, period_end

    def _usage_metric_name(self, metric_type: str) -> str:
        normalized = str(metric_type or "").strip().lower()
        # Keep compatibility with existing metric names already used elsewhere.
        mapping = {
            "api_calls": "api_calls",
            "snapshots": "snapshots",
            "judge_calls": "judge_calls",
            "guard_credits": "guard_credits_replay",
            "platform_replay_credits": "guard_credits_replay",
        }
        return mapping.get(normalized, normalized)

    def get_user_plan(self, user_id: int) -> Dict[str, Any]:
        """Get user's current plan details, limits, and enabled features"""
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()

        # Default to free plan if no subscription exists
        plan_type = normalize_plan_type(subscription.plan_type if subscription else "free")
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
                "snapshots_per_month": limits.get("snapshots_per_month"),
                "guard_credits_per_month": limits.get("guard_credits_per_month"),
                "platform_replay_credits_per_month": limits.get(
                    "platform_replay_credits_per_month", limits.get("guard_credits_per_month")
                ),
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
        plan_type = normalize_plan_type(plan_info["plan_type"])
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        now = datetime.utcnow()
        period_start, period_end = self._period_bounds(now)
        metric_name = self._usage_metric_name(metric_type)
        current_usage = (
            self.db.query(func.coalesce(func.sum(Usage.quantity), 0))
            .filter(
                Usage.user_id == user_id,
                Usage.metric_name == metric_name,
                Usage.timestamp >= period_start,
                Usage.timestamp < period_end,
            )
            .scalar()
            or 0
        )
        current_usage = int(current_usage)
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

    def increment_usage(
        self, user_id: int, metric_type: str, amount: int = 1, project_id: Optional[int] = None
    ) -> None:
        """Increment usage counter for a metric"""
        metric_name = self._usage_metric_name(metric_type)
        usage = Usage(
            user_id=user_id,
            project_id=project_id,
            metric_name=metric_name,
            quantity=int(amount),
            unit="count",
        )
        self.db.add(usage)

        self.db.commit()

    def get_usage_summary(self, user_id: int) -> Dict[str, Any]:
        """Get current usage vs limits for all metrics"""
        plan_info = self.get_user_plan(user_id)
        plan_type = plan_info["plan_type"]
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        now = datetime.utcnow()
        period_start, period_end = self._period_bounds(now)

        # Aggregate usage by metric_name for the current month.
        usage_by_metric: Dict[str, int] = {}
        usage_rows = (
            self.db.query(Usage.metric_name, func.coalesce(func.sum(Usage.quantity), 0).label("total"))
            .filter(
                Usage.user_id == user_id,
                Usage.timestamp >= period_start,
                Usage.timestamp < period_end,
            )
            .group_by(Usage.metric_name)
            .all()
        )
        for metric_name, total in usage_rows:
            usage_by_metric[str(metric_name)] = int(total or 0)

        # Build summary
        summary = {"period_start": period_start.isoformat(), "period_end": period_end.isoformat(), "metrics": {}}

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
            from datetime import datetime
            now = datetime.utcnow()
            current_year_month = now.strftime("%Y-%m")
            
            # Delete monthly usage keys for all users
            for user in users:
                # Delete all monthly usage keys (they will be recreated with new month on next increment)
                keys_to_delete = [
                    f"user:{user.id}:usage:monthly:{current_year_month}",
                    f"user:{user.id}:snapshots:monthly:{current_year_month}",
                    f"user:{user.id}:judge_calls:monthly:{current_year_month}",
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
    ) -> Subscription:
        """Create or update user subscription"""
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()

        now = datetime.utcnow()
        # Use provided period dates or default to current month
        if current_period_start is not None:
            period_start = current_period_start
        else:
            period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        if current_period_end is not None:
            period_end = current_period_end
        else:
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
