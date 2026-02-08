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

class AlertResponse(BaseModel):
    id: int
    project_id: int
    alert_type: str
    severity: str
    title: str
    message: str
    is_resolved: bool
    resolved_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("", response_model=List[AlertResponse])
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

@router.post("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    alert_service = Depends(get_alert_service),
):
    """Mark an alert as resolved."""
    alert = alert_service.get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    check_project_access(alert.project_id, current_user, db)
    
    updated_alert = alert_service.resolve_alert(alert_id, current_user.id)
    return updated_alert

@router.get("/stats")
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
