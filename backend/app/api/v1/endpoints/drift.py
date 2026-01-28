"""
Drift detection endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.drift_detection import DriftDetection
from app.services.drift_engine import DriftEngine

router = APIRouter()
drift_engine = DriftEngine()


class DriftDetectionResponse(BaseModel):
    """Drift detection response schema"""
    id: int
    project_id: int
    detection_type: str
    model: Optional[str]
    agent_name: Optional[str]
    current_value: Optional[float]
    baseline_value: Optional[float]
    change_percentage: float
    drift_score: float
    detection_details: Optional[dict]
    affected_fields: Optional[dict]
    severity: str
    detected_at: str
    baseline_period_start: Optional[str]
    baseline_period_end: Optional[str]

    class Config:
        from_attributes = True


class DetectDriftRequest(BaseModel):
    """Detect drift request"""
    model: Optional[str] = None
    agent_name: Optional[str] = None


@router.post("/detect")
@handle_errors
async def detect_drift(
    request: DetectDriftRequest,
    project_id: int = Query(..., description="Project ID", gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Detect drift for a project
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        f"User {current_user.id} requested drift detection for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "model": request.model, "agent_name": request.agent_name}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Run drift detection
    detections = drift_engine.detect_drift(
        project_id=project_id,
        model=request.model,
        agent_name=request.agent_name,
        db=db,
    )

    # Convert to response format
    detection_responses = [
        DriftDetectionResponse(
            id=detection.id,
            project_id=detection.project_id,
            detection_type=detection.detection_type,
            model=detection.model,
            agent_name=detection.agent_name,
            current_value=detection.current_value,
            baseline_value=detection.baseline_value,
            change_percentage=detection.change_percentage,
            drift_score=detection.drift_score,
            detection_details=detection.detection_details,
            affected_fields=detection.affected_fields,
            severity=detection.severity,
            detected_at=detection.detected_at.isoformat() if detection.detected_at else "",
            baseline_period_start=detection.baseline_period_start.isoformat() if detection.baseline_period_start else None,
            baseline_period_end=detection.baseline_period_end.isoformat() if detection.baseline_period_end else None,
        )
        for detection in detections
    ]

    logger.info(
        f"Drift detection completed for project {project_id}: {len(detections)} detections",
        extra={"user_id": current_user.id, "project_id": project_id, "count": len(detections)}
    )

    # Return using standard response format
    return success_response(data=[d.model_dump() for d in detection_responses])


@router.get("", response_model=List[DriftDetectionResponse])
@handle_errors
async def list_drift_detections(
    project_id: int = Query(..., description="Project ID", gt=0),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    detection_type: Optional[str] = None,
    severity: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List drift detections for a project
    """
    logger.info(
        f"User {current_user.id} requested drift detections for project {project_id} (limit: {limit}, offset: {offset})",
        extra={"user_id": current_user.id, "project_id": project_id, "limit": limit, "offset": offset}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Build query
    query = db.query(DriftDetection).filter(DriftDetection.project_id == project_id)

    # Apply filters
    if detection_type:
        query = query.filter(DriftDetection.detection_type == detection_type)
    if severity:
        query = query.filter(DriftDetection.severity == severity)

    # Get total count
    total = query.count()

    # Get items
    detections = (
        query
        .order_by(desc(DriftDetection.detected_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Convert to response format
    detection_responses = [
        DriftDetectionResponse(
            id=detection.id,
            project_id=detection.project_id,
            detection_type=detection.detection_type,
            model=detection.model,
            agent_name=detection.agent_name,
            current_value=detection.current_value,
            baseline_value=detection.baseline_value,
            change_percentage=detection.change_percentage,
            drift_score=detection.drift_score,
            detection_details=detection.detection_details,
            affected_fields=detection.affected_fields,
            severity=detection.severity,
            detected_at=detection.detected_at.isoformat() if detection.detected_at else "",
            baseline_period_start=detection.baseline_period_start.isoformat() if detection.baseline_period_start else None,
            baseline_period_end=detection.baseline_period_end.isoformat() if detection.baseline_period_end else None,
        )
        for detection in detections
    ]

    logger.info(
        f"Drift detections retrieved for project {project_id}: {len(detections)} detections (total: {total})",
        extra={"user_id": current_user.id, "project_id": project_id, "count": len(detections), "total": total}
    )

    # Return array directly (frontend expects array)
    return detection_responses


@router.get("/{drift_id}", response_model=DriftDetectionResponse)
@handle_errors
async def get_drift_detection(
    drift_id: int,
    project_id: int = Query(..., description="Project ID", gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a specific drift detection
    """
    logger.info(
        f"User {current_user.id} requested drift detection {drift_id} for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "drift_id": drift_id}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Get drift detection
    detection = db.query(DriftDetection).filter(
        DriftDetection.id == drift_id,
        DriftDetection.project_id == project_id
    ).first()

    if not detection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drift detection not found"
        )

    # Convert to response format
    return DriftDetectionResponse(
        id=detection.id,
        project_id=detection.project_id,
        detection_type=detection.detection_type,
        model=detection.model,
        agent_name=detection.agent_name,
        current_value=detection.current_value,
        baseline_value=detection.baseline_value,
        change_percentage=detection.change_percentage,
        drift_score=detection.drift_score,
        detection_details=detection.detection_details,
        affected_fields=detection.affected_fields,
        severity=detection.severity,
        detected_at=detection.detected_at.isoformat() if detection.detected_at else "",
        baseline_period_start=detection.baseline_period_start.isoformat() if detection.baseline_period_start else None,
        baseline_period_end=detection.baseline_period_end.isoformat() if detection.baseline_period_end else None,
    )
