"""
Cost analysis endpoints
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.services.cost_analyzer import CostAnalyzer


router = APIRouter()
cost_analyzer = CostAnalyzer()


class CostAnalysisResponse(BaseModel):
    """Cost analysis response schema"""

    total_cost: float
    by_model: Dict[str, float]
    by_provider: Dict[str, float]
    by_day: List[Dict[str, Any]]
    average_daily_cost: float


@router.get("/analysis")
@handle_errors
async def get_cost_analysis(
    project_id: int = Query(..., description="Project ID", gt=0),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get cost analysis for a project.

    Following API_REFERENCE.md: Returns standard response format.
    """
    logger.info(f"🔵 GET COST ANALYSIS: project_id={project_id}, days={days}, user_id={current_user.id}")
    logger.info(
        f"User {current_user.id} requested cost analysis for project {project_id} (days: {days})",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days},
    )

    # Verify project access (any member can view)
    check_project_access(project_id, current_user, db)

    # Calculate date range
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)

    # Get cost analysis using CostAnalyzer service
    analysis = cost_analyzer.analyze_project_costs(
        project_id=project_id,
        start_date=period_start,
        end_date=period_end,
        db=db,
    )

    logger.info(
        "Cost analysis retrieved for project %s: total_cost=$%.2f",
        project_id,
        analysis.get("total_cost", 0.0),
        extra={"user_id": current_user.id, "project_id": project_id, "total_cost": analysis.get("total_cost", 0.0)},
    )

    # Return using standard response format
    return success_response(data=analysis)
