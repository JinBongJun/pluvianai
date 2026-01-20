"""
Monitoring endpoints for status and links
"""

from fastapi import APIRouter, Depends
from app.core.config import settings
from app.core.database import get_db
from app.models import User, Project
from typing import Dict, Any
from sqlalchemy import func
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

router = APIRouter()


@router.get("/status")
async def monitoring_status() -> Dict[str, Any]:
    """Get monitoring status and URLs"""
    # Determine monitoring URLs based on environment
    if settings.ENVIRONMENT == "production":
        grafana_url = settings.GRAFANA_URL
        prometheus_url = settings.PROMETHEUS_URL
    else:
        grafana_url = "http://localhost:3001"
        prometheus_url = "http://localhost:9090"

    return {
        "metrics_enabled": True,
        "environment": settings.ENVIRONMENT,
        "monitoring": {
            "grafana_url": grafana_url,
            "prometheus_url": prometheus_url,
            "metrics_endpoint": "/metrics",
            "health_endpoint": "/health",
        },
        "status": "operational",
    }


@router.get("/metrics")
async def get_current_metrics(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get current metrics summary for widget display"""
    # Get active users count
    active_users_count = db.query(User).filter(User.is_active.is_(True)).count()

    # Get active projects count
    active_projects_count = db.query(Project).filter(Project.is_active.is_(True)).count()

    # Note: For real-time request/error/latency metrics, you would query Prometheus
    # For now, we return basic counts. In production, you'd integrate with Prometheus API

    return {
        "total_requests": 0,  # Would be fetched from Prometheus
        "error_rate": 0.0,  # Would be calculated from Prometheus metrics
        "avg_latency": 0,  # Would be fetched from Prometheus
        "active_users": active_users_count,
        "active_projects": active_projects_count,
        "timestamp": datetime.utcnow().isoformat(),
    }
