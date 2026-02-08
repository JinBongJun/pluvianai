from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional

from app.core.dependencies import get_db
from app.services.dashboard_service import DashboardService
from app.api.v1.endpoints.projects import check_project_access

router = APIRouter()
dashboard_service = DashboardService()

@router.get("/projects/{project_id}/dashboard/metrics")
async def get_dashboard_metrics(
    project_id: int,
    period: str = Query("24h", regex="^(24h|7d|30d)$"),
    db: Session = Depends(get_db)
):
    """Get dashboard metrics for a project"""
    await check_project_access(project_id, db)
    return dashboard_service.get_realtime_metrics(project_id, period, db)

@router.get("/projects/{project_id}/dashboard/trends")
async def get_dashboard_trends(
    project_id: int,
    period: str = Query("7d", regex="^(1d|7d|30d|90d)$"),
    group_by: str = Query("hour", regex="^(hour|day|week)$"),
    db: Session = Depends(get_db)
):
    """Get trend analysis for a project"""
    await check_project_access(project_id, db)
    return dashboard_service.get_trend_analysis(project_id, period, group_by, db)
