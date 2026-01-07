"""
Activity log endpoints
"""
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
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


@router.get("", response_model=List[ActivityLogResponse])
async def list_activity_logs(
    project_id: Optional[int] = Query(None, description="Optional project ID filter"),
    activity_type: Optional[str] = Query(None, description="Filter by activity type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List activity logs for current user"""
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Build query - only show user's own activities
    query = db.query(ActivityLog).filter(
        ActivityLog.user_id == current_user.id,
        ActivityLog.created_at >= start_date,
        ActivityLog.created_at <= end_date
    )
    
    # Apply filters
    if project_id:
        query = query.filter(ActivityLog.project_id == project_id)
    if activity_type:
        query = query.filter(ActivityLog.activity_type == activity_type)
    
    # Order by created_at descending and paginate
    logs = query.order_by(desc(ActivityLog.created_at)).offset(offset).limit(limit).all()
    
    return [
        ActivityLogResponse(
            id=log.id,
            user_id=log.user_id,
            project_id=log.project_id,
            activity_type=log.activity_type,
            action=log.action,
            description=log.description,
            activity_data=log.activity_data,
            created_at=log.created_at.isoformat()
        )
        for log in logs
    ]

