"""
Dashboard endpoints for real-time metrics and trend analysis
"""

import json
import asyncio
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.services.dashboard_service import DashboardService

router = APIRouter()


class RealtimeMetricsResponse(BaseModel):
    """Real-time metrics response schema"""
    period: str
    period_start: str
    period_end: str
    api_calls: dict
    quality: dict
    drift: dict
    cost: dict
    recent_alerts: list


class TrendAnalysisResponse(BaseModel):
    """Trend analysis response schema"""
    period: str
    group_by: str
    period_start: str
    period_end: str
    quality_trends: list
    model_comparison: list
    agent_comparison: list


def get_dashboard_service(db: Session = Depends(get_db)) -> DashboardService:
    """Dependency to get dashboard service"""
    return DashboardService()


@router.get("/projects/{project_id}/dashboard/metrics", response_model=RealtimeMetricsResponse)
@handle_errors
async def get_realtime_metrics(
    project_id: int,
    period: str = Query("24h", description="Time period: 24h, 7d, 30d"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    dashboard_service: DashboardService = Depends(get_dashboard_service),
):
    """
    Get real-time metrics for a project
    
    Returns:
        Real-time metrics including API calls, quality scores, drift detections, cost, and alerts
    """
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Validate period
    if period not in ["24h", "7d", "30d"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid period. Must be one of: 24h, 7d, 30d"
        )

    try:
        metrics = dashboard_service.get_realtime_metrics(project_id, period, db)
        return success_response(data=metrics)
    except Exception as e:
        logger.error(
            f"Failed to get real-time metrics for project {project_id}: {str(e)}",
            extra={"project_id": project_id, "period": period},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get metrics: {str(e)}"
        )


@router.get("/projects/{project_id}/dashboard/trends", response_model=TrendAnalysisResponse)
@handle_errors
async def get_trend_analysis(
    project_id: int,
    period: str = Query("7d", description="Time period: 1d, 7d, 30d, 90d"),
    group_by: str = Query("hour", description="Grouping interval: hour, day, week"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    dashboard_service: DashboardService = Depends(get_dashboard_service),
):
    """
    Get trend analysis for a project
    
    Returns:
        Trend data including quality trends over time, model comparison, and agent comparison
    """
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Validate parameters
    if period not in ["1d", "7d", "30d", "90d"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid period. Must be one of: 1d, 7d, 30d, 90d"
        )
    
    if group_by not in ["hour", "day", "week"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid group_by. Must be one of: hour, day, week"
        )

    try:
        trends = dashboard_service.get_trend_analysis(project_id, period, group_by, db)
        return success_response(data=trends)
    except Exception as e:
        logger.error(
            f"Failed to get trend analysis for project {project_id}: {str(e)}",
            extra={"project_id": project_id, "period": period, "group_by": group_by},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get trends: {str(e)}"
        )


@router.get("/projects/{project_id}/dashboard/stream")
@handle_errors
async def stream_metrics(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    dashboard_service: DashboardService = Depends(get_dashboard_service),
):
    """
    Stream real-time metrics via Server-Sent Events (SSE)
    
    Updates every 5 seconds with latest metrics
    """
    # Verify project access
    check_project_access(project_id, current_user, db)

    async def event_generator():
        """Generate SSE events"""
        try:
            while True:
                # Get latest metrics
                metrics = dashboard_service.get_realtime_metrics(project_id, "24h", db)
                
                # Format as SSE event
                event_data = {
                    "type": "metrics",
                    "data": metrics,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                # Send event
                yield f"data: {json.dumps(event_data)}\n\n"
                
                # Wait 5 seconds before next update
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            logger.info(f"SSE stream cancelled for project {project_id}")
            raise
        except Exception as e:
            logger.error(
                f"Error in SSE stream for project {project_id}: {str(e)}",
                extra={"project_id": project_id},
                exc_info=True
            )
            # Send error event
            error_event = {
                "type": "error",
                "data": {"message": "Failed to fetch metrics"},
                "timestamp": datetime.utcnow().isoformat()
            }
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )
