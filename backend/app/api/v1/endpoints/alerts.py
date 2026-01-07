"""
Alert endpoints
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.project import Project
from app.models.alert import Alert
from app.services.alert_service import AlertService
from app.services.subscription_service import SubscriptionService

router = APIRouter()
alert_service = AlertService()


class AlertResponse(BaseModel):
    """Alert response schema"""
    id: int
    project_id: int
    alert_type: str
    severity: str
    title: str
    message: str
    alert_data: dict | None = None
    is_sent: bool
    sent_at: str | None = None
    notification_channels: list | None = None
    is_resolved: bool
    resolved_at: str | None = None
    resolved_by: int | None = None
    created_at: str
    
    class Config:
        from_attributes = True


@router.get("", response_model=List[AlertResponse])
async def list_alerts(
    project_id: int = Query(..., description="Project ID"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    alert_type: str | None = None,
    severity: str | None = None,
    is_resolved: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List alerts for a project"""
    # Verify project access (any member can view alerts)
    project = check_project_access(project_id, current_user, db)
    
    # Build query
    query = db.query(Alert).filter(Alert.project_id == project_id)
    
    if alert_type:
        query = query.filter(Alert.alert_type == alert_type)
    if severity:
        query = query.filter(Alert.severity == severity)
    if is_resolved is not None:
        query = query.filter(Alert.is_resolved == is_resolved)
    
    # Order by created_at descending and paginate
    alerts = query.order_by(desc(Alert.created_at)).offset(offset).limit(limit).all()
    
    return alerts


@router.post("/{alert_id}/send")
async def send_alert(
    alert_id: int,
    channels: List[str] | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send an alert through notification channels"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    # Verify project access
    project = check_project_access(alert.project_id, current_user, db)
    
    # Check alert feature access
    subscription_service = SubscriptionService(db)
    plan_info = subscription_service.get_user_plan(project.owner_id)
    alerts_feature = plan_info["features"].get("alerts", False)
    
    if not alerts_feature:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Alerts are not available on your current plan. Please upgrade to Indie plan or higher."
        )
    
    # Check channel access (Indie: email only, Startup+: full)
    if channels:
        if alerts_feature == "email" and any(ch not in ["email"] for ch in channels):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Slack/Discord alerts require Startup plan or higher. Indie plan supports email only."
            )
    
    # Send alert
    results = await alert_service.send_alert(alert, channels)
    
    # Update alert status
    if any(r.get("status") == "sent" for r in results.values()):
        alert.is_sent = True
        from datetime import datetime
        alert.sent_at = datetime.utcnow()
        db.commit()
    
    return {"alert_id": alert_id, "results": results}


@router.post("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark an alert as resolved"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    # Verify project access (any member can resolve alerts)
    project = check_project_access(alert.project_id, current_user, db)
    
    alert.is_resolved = True
    alert.resolved_by = current_user.id
    from datetime import datetime
    alert.resolved_at = datetime.utcnow()
    
    db.commit()
    db.refresh(alert)
    
    return alert


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific alert"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    # Verify project access (any member can view)
    project = check_project_access(alert.project_id, current_user, db)
    
    return alert

