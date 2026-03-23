from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional

from app.core.dependencies import get_db
from app.core.permissions import check_project_access
from app.core.security import get_current_user
from app.services.dashboard_service import DashboardService
from app.models.user import User

router = APIRouter()
dashboard_service = DashboardService()

@router.get("/projects/{project_id}/dashboard/metrics")
async def get_dashboard_metrics(
    project_id: int,
    period: str = Query("24h", pattern="^(24h|7d|30d)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard metrics for a project"""
    check_project_access(project_id, current_user, db)
    return dashboard_service.get_realtime_metrics(project_id, period, db)

@router.get("/projects/{project_id}/dashboard/trends")
async def get_dashboard_trends(
    project_id: int,
    period: str = Query("7d", pattern="^(1d|7d|30d|90d)$"),
    group_by: str = Query("hour", pattern="^(hour|day|week)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get trend analysis for a project"""
    check_project_access(project_id, current_user, db)
    return dashboard_service.get_trend_analysis(project_id, period, group_by, db)
