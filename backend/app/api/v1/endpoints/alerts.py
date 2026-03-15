from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.core.dependencies import get_alert_service
from app.models.alert import Alert

router = APIRouter()

# Path prefix when mounted: /projects (so full path e.g. /api/v1/projects/{project_id}/alerts)

class AlertResponse(BaseModel):
    id: int
    project_id: int
    alert_type: str
    severity: str
    title: str
    message: str  # API contract; Alert model exposes via message property from description
    is_resolved: bool
    resolved_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/{project_id}/alerts/stats")
def get_alert_stats(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get alert statistics for a project."""
    check_project_access(project_id, current_user, db)
    from sqlalchemy import func
    stats = db.query(
        Alert.severity,
        func.count(Alert.id).label("count")
    ).filter(
        Alert.project_id == project_id,
        Alert.is_resolved == False
    ).group_by(Alert.severity).all()
    return {
        "open_alerts": sum(s.count for s in stats),
        "by_severity": {s.severity: s.count for s in stats}
    }


@router.get("/{project_id}/alerts/{alert_id}", response_model=AlertResponse)
def get_alert(
    project_id: int,
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    alert_service = Depends(get_alert_service),
):
    """Get a single alert by id; must belong to the given project."""
    check_project_access(project_id, current_user, db)
    alert = alert_service.get_alert_by_id(alert_id)
    if not alert or alert.project_id != project_id:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.get("/{project_id}/alerts", response_model=List[AlertResponse])
def list_alerts(
    project_id: int,
    is_resolved: Optional[bool] = Query(None),
    alert_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    alert_service = Depends(get_alert_service),
):
    """List alerts for a project with filters."""
    check_project_access(project_id, current_user, db)
    return alert_service.get_alerts_by_project_id(
        project_id=project_id,
        limit=limit,
        offset=offset,
        alert_type=alert_type,
        severity=severity,
        is_resolved=is_resolved
    )


@router.post("/{project_id}/alerts/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(
    project_id: int,
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    alert_service = Depends(get_alert_service),
):
    """Mark an alert as resolved; alert must belong to the given project."""
    alert = alert_service.get_alert_by_id(alert_id)
    if not alert or alert.project_id != project_id:
        raise HTTPException(status_code=404, detail="Alert not found")
    check_project_access(project_id, current_user, db)
    return alert_service.resolve_alert(alert_id, current_user.id)
