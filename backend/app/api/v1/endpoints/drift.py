"""
Drift detection endpoints
"""
from typing import List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.project import Project
from app.models.drift_detection import DriftDetection
from app.services.drift_engine import DriftEngine
from app.services.subscription_service import SubscriptionService

router = APIRouter()

drift_engine = DriftEngine()


class DriftDetectionResponse(BaseModel):
    """Drift detection response schema"""
    id: int
    project_id: int
    detection_type: str
    model: str | None
    agent_name: str | None
    current_value: float | None
    baseline_value: float | None
    change_percentage: float
    drift_score: float
    severity: str
    detected_at: datetime
    detection_details: dict | None = None
    affected_fields: list | None = None
    baseline_period_start: datetime | None = None
    baseline_period_end: datetime | None = None
    
    class Config:
        from_attributes = True


class DetectDriftRequest(BaseModel):
    """Request to detect drift"""
    model: str | None = None
    agent_name: str | None = None


@router.post("/detect", response_model=List[DriftDetectionResponse])
async def detect_drift(
    project_id: int = Query(..., description="Project ID"),
    request: DetectDriftRequest = DetectDriftRequest(),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Detect drift for a project"""
    
    # Verify project access (any member can detect drift)
    project = check_project_access(project_id, current_user, db)
    
    # Check drift detection level (basic is always available, enhanced requires Startup+)
    subscription_service = SubscriptionService(db)
    plan_info = subscription_service.get_user_plan(project.owner_id)
    drift_level = plan_info["features"].get("drift_detection", "basic")
    
    # Basic drift (length/format) is always available
    # Enhanced drift (semantic/tone) requires Startup plan or higher
    # For now, all drift detection is available, but we can restrict enhanced features later
    
    # Detect drift (this now creates alerts automatically)
    detections = drift_engine.detect_drift(
        project_id=project_id,
        model=request.model,
        agent_name=request.agent_name,
        db=db
    )
    
    # Get alerts created by drift detection (created in the last 5 seconds)
    from app.models.alert import Alert
    from app.services.alert_service import AlertService
    from app.services.webhook_service import webhook_service
    from app.core.database import SessionLocal
    
    # Get recently created alerts for this project
    alerts = db.query(Alert).filter(
        Alert.project_id == project_id,
        Alert.alert_type == "drift",
        Alert.created_at >= datetime.utcnow() - timedelta(seconds=5)
    ).all()
    
    # Send alerts and trigger webhooks in background tasks
    alert_service = AlertService()
    for alert in alerts:
        async def send_alert_task(alert_id: int):
            db_session = SessionLocal()
            try:
                alert = db_session.query(Alert).filter(Alert.id == alert_id).first()
                if alert:
                    await alert_service.send_alert(alert, db=db_session)
                    await webhook_service.trigger_alert_webhooks(alert, db_session)
            except Exception as e:
                from app.core.logging_config import logger
                logger.error(f"Error sending alert for drift detection: {str(e)}")
            finally:
                db_session.close()
        
        background_tasks.add_task(send_alert_task, alert.id)
    
    return detections


@router.get("", response_model=List[DriftDetectionResponse])
async def list_drift_detections(
    project_id: int = Query(..., description="Project ID"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    detection_type: str | None = None,
    severity: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List drift detections for a project"""
    try:
        # Verify project access (any member can detect drift)
        project = check_project_access(project_id, current_user, db)
        
        # Build query
        query = db.query(DriftDetection).filter(DriftDetection.project_id == project_id)
        
        if detection_type:
            query = query.filter(DriftDetection.detection_type == detection_type)
        if severity:
            query = query.filter(DriftDetection.severity == severity)
        
        # Order by detected_at descending and paginate
        detections = query.order_by(desc(DriftDetection.detected_at)).offset(offset).limit(limit).all()
        
        return detections
    except Exception as e:
        from app.core.logging_config import logger
        logger.error(f"Error listing drift detections for project {project_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve drift detections: {str(e)}"
        )


@router.get("/{detection_id}", response_model=DriftDetectionResponse)
async def get_drift_detection(
    detection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific drift detection"""
    detection = db.query(DriftDetection).filter(DriftDetection.id == detection_id).first()
    
    if not detection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drift detection not found"
        )
    
    # Verify project access (any member can view)
    project = check_project_access(detection.project_id, current_user, db)
    
    return detection
