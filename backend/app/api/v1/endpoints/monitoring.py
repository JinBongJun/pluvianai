from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, get_current_user_optional
from app.models.api_call import APICall
from app.models.project import Project
from app.models.user import User

router = APIRouter()


@router.get("/status")
def get_monitoring_status(current_user: User | None = Depends(get_current_user_optional)):
    return {
        "metrics_enabled": True,
        "environment": settings.ENVIRONMENT,
        "monitoring": {
            "metrics_endpoint": settings.PROMETHEUS_URL or "/metrics",
            "health_endpoint": "/api/v1/health",
        },
        "status": "operational",
        "authenticated": current_user is not None,
    }


@router.get("/metrics")
def get_current_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total_requests = db.query(APICall).count()
    error_requests = db.query(APICall).filter(APICall.status_code >= 400).count()
    avg_latency_raw = db.query(func.avg(APICall.latency_ms)).scalar()
    active_users = db.query(User).filter(User.is_active.is_(True)).count()
    active_projects = (
        db.query(Project)
        .filter(Project.is_active.is_(True), Project.is_deleted.is_(False))
        .count()
    )

    error_rate = (error_requests / total_requests) if total_requests else 0.0

    return {
        "total_requests": int(total_requests),
        "error_rate": float(error_rate),
        "avg_latency": int(round(float(avg_latency_raw or 0))),
        "active_users": int(active_users),
        "active_projects": int(active_projects),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
