"""
Activity log endpoints
"""

from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.activity_log import ActivityLog

router = APIRouter()


class ActivityLogResponse(BaseModel):
    """Activity log response schema"""

    id: int
    user_id: int
    project_id: int | None
    activity_type: str
    action: str
    description: str | None
    activity_data: dict | None
    created_at: str

    class Config:
        from_attributes = True


class ActivityLogListResponse(BaseModel):
    """Paginated activity log response schema"""

    items: List[ActivityLogResponse]
    total: int
    limit: int
    offset: int


@router.get("", response_model=ActivityLogListResponse)
async def list_activity_logs(
    project_id: Optional[int] = Query(None, description="Optional project ID filter"),
    activity_type: Optional[str] = Query(None, description="Filter by activity type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List activity logs for current user"""
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # Build base query - only show user's own activities
    base_query = db.query(ActivityLog).filter(
        ActivityLog.user_id == current_user.id, ActivityLog.created_at >= start_date, ActivityLog.created_at <= end_date
    )

    # Apply filters for counting
    count_query = base_query
    if project_id:
        count_query = count_query.filter(ActivityLog.project_id == project_id)
    if activity_type:
        count_query = count_query.filter(ActivityLog.activity_type == activity_type)

    # Get total count
    total = count_query.count()

    # Apply filters for data query
    data_query = base_query
    if project_id:
        data_query = data_query.filter(ActivityLog.project_id == project_id)
    if activity_type:
        data_query = data_query.filter(ActivityLog.activity_type == activity_type)

    # Order by created_at descending and paginate
    logs = data_query.order_by(desc(ActivityLog.created_at)).offset(offset).limit(limit).all()

    return ActivityLogListResponse(
        items=[
            ActivityLogResponse(
                id=log.id,
                user_id=log.user_id,
                project_id=log.project_id,
                activity_type=log.activity_type,
                action=log.action,
                description=log.description,
                activity_data=log.activity_data,
                created_at=log.created_at.isoformat(),
            )
            for log in logs
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
