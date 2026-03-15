"""
Activity log endpoints
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.decorators import handle_errors
from app.core.permissions import check_project_access
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.api_call import APICall
from app.models.project import Project
from app.models.alert import Alert

router = APIRouter()


class ActivityItem(BaseModel):
    """Activity log item"""
    id: int
    user_id: Optional[int]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[int]
    old_value: Optional[dict]
    new_value: Optional[dict]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("")
@handle_errors
async def list_activity(
    limit: int = Query(100, ge=1, le=1000, description="Number of items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    project_id: Optional[int] = Query(None, description="Filter by project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get user activity log
    Returns: {items: [], total: number, limit: number, offset: number}
    """
    logger.info(
        f"User {current_user.id} requested activity log (limit: {limit}, offset: {offset}, project_id: {project_id})",
        extra={"user_id": current_user.id, "limit": limit, "offset": offset, "project_id": project_id}
    )

    if project_id is not None:
        check_project_access(project_id, current_user, db)

    # Build query - filter by user_id
    query = db.query(AuditLog).filter(AuditLog.user_id == current_user.id)

    # Filter by project if provided (check resource_type and resource_id)
    if project_id:
        # Try to find project-related activities by checking resource_type
        query = query.filter(
            or_(
                AuditLog.resource_type == 'project',
                AuditLog.resource_id == project_id
            )
        )
    
    # Get total count
    total = query.count()
    
    # Get items
    items = (
        query
        .order_by(desc(AuditLog.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    # Convert to response format
    activity_items = [
        ActivityItem(
            id=item.id,
            user_id=item.user_id,
            action=item.action,
            resource_type=item.resource_type,
            resource_id=item.resource_id,
            old_value=item.old_value if item.old_value else {},
            new_value=item.new_value if item.new_value else {},
            ip_address=item.ip_address,
            created_at=item.created_at,
        )
        for item in items
    ]
    
    logger.info(
        f"Activity log retrieved for user {current_user.id}: {len(activity_items)} items (total: {total})",
        extra={"user_id": current_user.id, "count": len(activity_items), "total": total}
    )
    
    # Return in format expected by frontend: {items: [], total: number, limit: number, offset: number}
    return success_response(data={
        "items": [item.model_dump() for item in activity_items],
        "total": total,
        "limit": limit,
        "offset": offset,
    })
