"""
In-app notifications endpoints
"""
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.alert import Alert
from app.models.project import Project
from app.core.permissions import check_project_access

router = APIRouter()


class NotificationResponse(BaseModel):
    """Notification response schema"""
    id: int
    project_id: int
    alert_type: str
    severity: str
    title: str
    message: str
    is_read: bool = False
    created_at: str
    
    class Config:
        from_attributes = True


# In-memory notification read status (in production, use database)
notification_read_status: Dict[int, set] = {}  # user_id -> set of alert_ids


@router.get("", response_model=List[NotificationResponse])
async def list_notifications(
    project_id: Optional[int] = Query(None, description="Optional project ID filter"),
    is_read: Optional[bool] = Query(None, description="Filter by read status"),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List notifications for current user"""
    # Get alerts from projects user has access to
    # For now, get alerts from all projects user owns or is a member of
    from app.models.project_member import ProjectMember
    
    # Get project IDs user has access to
    owned_projects = db.query(Project.id).filter(Project.owner_id == current_user.id).all()
    member_projects = db.query(ProjectMember.project_id).filter(ProjectMember.user_id == current_user.id).all()
    
    project_ids = [p.id for p in owned_projects] + [p for p in member_projects]
    
    if project_id:
        # Verify access
        check_project_access(project_id, current_user, db)
        project_ids = [project_id]
    
    if not project_ids:
        return []
    
    # Get alerts
    query = db.query(Alert).filter(Alert.project_id.in_(project_ids))
    
    if is_read is not None:
        # Filter by read status (in-memory for now)
        read_alerts = notification_read_status.get(current_user.id, set())
        if is_read:
            query = query.filter(Alert.id.in_(read_alerts))
        else:
            query = query.filter(~Alert.id.in_(read_alerts))
    
    alerts = query.order_by(desc(Alert.created_at)).limit(limit).all()
    
    # Get read status
    read_alerts = notification_read_status.get(current_user.id, set())
    
    return [
        NotificationResponse(
            id=alert.id,
            project_id=alert.project_id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            title=alert.title,
            message=alert.message,
            is_read=alert.id in read_alerts,
            created_at=alert.created_at.isoformat()
        )
        for alert in alerts
    ]


@router.patch("/{alert_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a notification as read"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    # Verify project access
    check_project_access(alert.project_id, current_user, db)
    
    # Mark as read (in-memory for now)
    if current_user.id not in notification_read_status:
        notification_read_status[current_user.id] = set()
    notification_read_status[current_user.id].add(alert_id)
    
    return None


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a notification (mark as read and hide)"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    # Verify project access
    check_project_access(alert.project_id, current_user, db)
    
    # Mark as read (in-memory for now)
    if current_user.id not in notification_read_status:
        notification_read_status[current_user.id] = set()
    notification_read_status[current_user.id].add(alert_id)
    
    return None


@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get count of unread notifications"""
    from app.models.project_member import ProjectMember
    
    # Get project IDs user has access to
    owned_projects = db.query(Project.id).filter(Project.owner_id == current_user.id).all()
    member_projects = db.query(ProjectMember.project_id).filter(ProjectMember.user_id == current_user.id).all()
    
    project_ids = [p.id for p in owned_projects] + [p for p in member_projects]
    
    if not project_ids:
        return {"count": 0}
    
    # Get all alerts
    all_alerts = db.query(Alert.id).filter(Alert.project_id.in_(project_ids)).all()
    alert_ids = [a.id for a in all_alerts]
    
    # Get read status
    read_alerts = notification_read_status.get(current_user.id, set())
    
    unread_count = len([aid for aid in alert_ids if aid not in read_alerts])
    
    return {"count": unread_count}

