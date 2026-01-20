"""
Alert endpoints
"""

from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.models.user import User
from app.models.alert import Alert
from app.services.alert_service import AlertService

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
    sent_at: datetime | None = None
    notification_channels: list | None = None
    is_resolved: bool
    resolved_at: datetime | None = None
    resolved_by: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class SendAlertRequest(BaseModel):
    """Request to send alert"""

    channels: List[str] | None = None  # Optional: if None, use alert's default channels


@router.get("", response_model=List[AlertResponse])
@handle_errors
async def list_alerts(
    project_id: int = Query(..., description="Project ID"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    alert_type: str | None = None,
    severity: str | None = None,
    is_resolved: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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
@handle_errors
async def send_alert(
    alert_id: int,
    request: SendAlertRequest = SendAlertRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send an alert through notification channels"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()

    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    # Verify project access
    project = check_project_access(alert.project_id, current_user, db)

    # Use channels from request, or default to alert's notification_channels, or ["email"]
    channels = request.channels or alert.notification_channels or ["email"]

    # Send alert (simplified - remove complex subscription checks for now)
    results = await alert_service.send_alert(alert, channels, db=db)

    # Update alert status
    if any(r.get("status") == "sent" for r in results.values()):
        alert.is_sent = True
        alert.sent_at = datetime.utcnow()
        if alert.notification_channels is None:
            alert.notification_channels = channels
        db.commit()
        db.refresh(alert)

    return {"alert_id": alert_id, "results": results}


@router.post("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(alert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mark an alert as resolved"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()

    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

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
async def get_alert(alert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a specific alert"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()

    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    # Verify project access (any member can view)
    project = check_project_access(alert.project_id, current_user, db)

    return alert
