"""
Centralized feature access checking
"""

from typing import Optional
from sqlalchemy.orm import Session
from app.services.subscription_service import SubscriptionService
from app.core.subscription_limits import PLAN_LIMITS
from app.core.exceptions import UpgradeRequiredException
from app.core.logging_config import logger


def check_feature_access(
    db: Session,
    user_id: int,
    feature_name: str,
    required_plan: str = "pro",
    message: Optional[str] = None
) -> bool:
    """
    Checks if the user has access to a specific feature based on their subscription plan.
    Raises UpgradeRequiredException if access is denied.
    
    Args:
        db: SQLAlchemy Session
        user_id: ID of the current user
        feature_name: The name of the feature to check (e.g., "quality_checks.advanced")
        required_plan: The minimum plan type required for this feature (e.g., "pro", "enterprise")
        message: Custom message for the exception
    
    Returns:
        True if the user has access.
    
    Raises:
        UpgradeRequiredException: If the user's current plan does not grant access to the feature.
    """
    subscription_service = SubscriptionService(db)
    plan_info = subscription_service.get_user_plan(user_id)
    current_plan = plan_info["plan_type"]
    
    has_access = subscription_service.check_feature_access(user_id, feature_name)
    
    if not has_access:
        logger.warning(f"Feature access denied for user {user_id} (plan: {current_plan}) for feature: {feature_name}. Required plan: {required_plan}")
        raise UpgradeRequiredException(
            message=message or f"Access to '{feature_name}' requires the {required_plan} plan or higher.",
            current_plan=current_plan,
            required_plan=required_plan,
            feature=feature_name
        )
    return True


def get_required_plan_for_feature(feature_name: str) -> Optional[str]:
    """Get the minimum plan required for a feature"""
    FEATURE_PLAN_REQUIREMENTS = {
        "auto_mapping": "pro",
        "production_guard": "pro",
        "enhanced_quality": "startup",
        "alerts": "indie",
        "multi_model_comparison": "startup",
        "weekly_reports": "startup",
        "advanced_cost_optimizer": "pro",
        "region_latency": "pro",
        "rbac": "pro",
        "self_hosted": "enterprise",
        "dedicated_support": "enterprise",
        "sla": "enterprise",
        "data_masking": "enterprise",
        "custom_evaluator_rules": "enterprise",
    }
    return FEATURE_PLAN_REQUIREMENTS.get(feature_name)
