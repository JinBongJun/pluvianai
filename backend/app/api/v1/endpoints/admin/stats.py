"""
Admin statistics endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.decorators import handle_errors
from app.core.responses import success_response
from app.core.logging_config import logger
from app.models.user import User
from app.models.project import Project
from app.models.alert import Alert
from app.models.subscription import Subscription

router = APIRouter()


@router.get("/stats")
@handle_errors
async def get_admin_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get admin statistics (superuser only)
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superusers can access admin statistics"
        )

    # Get total users
    total_users = db.query(func.count(User.id)).scalar() or 0

    # Get active projects
    active_projects = (
        db.query(func.count(Project.id))
        .filter(Project.is_active == True)
        .scalar() or 0
    )

    # Get total revenue (from subscriptions)
    total_revenue = (
        db.query(func.sum(Subscription.monthly_cost))
        .filter(Subscription.status == "active")
        .scalar() or 0.0
    )

    # Get open alerts
    open_alerts = (
        db.query(func.count(Alert.id))
        .filter(Alert.status == "open")
        .scalar() or 0
    )

    # Get active subscriptions count
    active_subscriptions = (
        db.query(func.count(Subscription.id))
        .filter(Subscription.status == "active")
        .scalar() or 0
    )

    # Calculate MRR (Monthly Recurring Revenue)
    mrr = float(total_revenue)  # Assuming monthly_cost is already monthly

    return success_response(data={
        "total_users": total_users,
        "active_projects": active_projects,
        "total_revenue": float(total_revenue),
        "open_alerts": open_alerts,
        "active_subscriptions": active_subscriptions,
        "mrr": mrr,
    })
