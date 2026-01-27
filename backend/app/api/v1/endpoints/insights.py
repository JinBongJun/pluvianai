"""
Daily Insights endpoints for AI-powered daily summaries
"""

from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.responses import success_response
from app.core.logging_config import logger
from app.models.user import User
from app.services.insights_service import InsightService


router = APIRouter()


@router.get("/daily")
@handle_errors
async def get_daily_insights(
    project_id: int = Query(..., description="Project ID"),
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (defaults to today)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get daily insights for a project
    
    Returns AI-generated summary with Z-Score based anomaly detection.
    """
    logger.info(
        f"User {current_user.id} requested daily insights for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "date": date}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Parse date
    target_date = None
    if date:
        try:
            target_date = datetime.fromisoformat(date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )

    # Create service
    service = InsightService(db)

    # Generate insights
    insights = service.generate_daily_insights(project_id, target_date)

    logger.info(
        f"Daily insights generated: {len(insights['anomalies'])} anomalies",
        extra={"user_id": current_user.id, "project_id": project_id}
    )

    return success_response(data=insights)
