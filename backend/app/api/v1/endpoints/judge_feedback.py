"""
Judge Feedback API endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.models.user import User
from app.models.judge_feedback import JudgeFeedback
from app.models.quality_score import QualityScore
from app.services.judge_reliability_service import judge_reliability_service
from app.core.logging_config import logger

router = APIRouter()


class JudgeFeedbackCreate(BaseModel):
    """Schema for creating judge feedback"""
    evaluation_id: int
    judge_score: float = Field(..., ge=0, le=100)
    human_score: float = Field(..., ge=0, le=100)
    comment: Optional[str] = None
    correction_reason: Optional[str] = None
    metadata: Optional[dict] = None


class JudgeFeedbackUpdate(BaseModel):
    """Schema for updating judge feedback"""
    human_score: Optional[float] = Field(None, ge=0, le=100)
    comment: Optional[str] = None
    correction_reason: Optional[str] = None
    metadata: Optional[dict] = None


class JudgeFeedbackResponse(BaseModel):
    """Schema for judge feedback response"""
    id: int
    project_id: int
    evaluation_id: int
    judge_score: float
    human_score: float
    alignment_score: Optional[float]
    comment: Optional[str]
    correction_reason: Optional[str]
    # Map API field "metadata" to model attribute "extra_metadata"
    metadata: Optional[dict] = Field(default=None, alias="extra_metadata")
    created_at: str
    updated_at: Optional[str]

    class Config:
        # Pydantic v2 style; enables ORM mode and population by field name
        from_attributes = True
        populate_by_name = True


class JudgeReliabilityMetricsResponse(BaseModel):
    """Schema for judge reliability metrics"""
    total_feedbacks: int
    average_alignment: Optional[float]
    reliability_score: Optional[float]
    feedbacks_with_alignment: int


@router.post("/projects/{project_id}/judge/feedback", response_model=JudgeFeedbackResponse, status_code=status.HTTP_201_CREATED)
@handle_errors
async def create_judge_feedback(
    project_id: int,
    feedback_data: JudgeFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create judge feedback for an evaluation"""
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Verify evaluation exists and belongs to project
    evaluation = db.query(QualityScore).filter(
        QualityScore.id == feedback_data.evaluation_id,
        QualityScore.project_id == project_id
    ).first()

    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation not found"
        )

    # Calculate alignment score
    alignment_score = judge_reliability_service.calculate_alignment_score(
        feedback_data.judge_score,
        feedback_data.human_score
    )

    # Create feedback
    feedback = JudgeFeedback(
        project_id=project_id,
        evaluation_id=feedback_data.evaluation_id,
        judge_score=feedback_data.judge_score,
        human_score=feedback_data.human_score,
        alignment_score=alignment_score,
        comment=feedback_data.comment,
        correction_reason=feedback_data.correction_reason,
        extra_metadata=feedback_data.metadata
    )

    db.add(feedback)
    # Commit handled automatically by get_db() dependency
    db.refresh(feedback)

    logger.info(f"Judge feedback created: {feedback.id} for evaluation {feedback_data.evaluation_id} by user {current_user.id}")

    return feedback


@router.get("/projects/{project_id}/judge/feedback", response_model=List[JudgeFeedbackResponse])
@handle_errors
async def get_judge_feedback(
    project_id: int,
    evaluation_id: Optional[int] = Query(None, description="Filter by evaluation ID"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get judge feedback for a project"""
    # Verify project access
    check_project_access(project_id, current_user, db)

    query = db.query(JudgeFeedback).filter(JudgeFeedback.project_id == project_id)

    if evaluation_id:
        query = query.filter(JudgeFeedback.evaluation_id == evaluation_id)

    feedbacks = query.order_by(JudgeFeedback.created_at.desc()).offset(offset).limit(limit).all()

    return feedbacks


@router.put("/projects/{project_id}/judge/feedback/{feedback_id}", response_model=JudgeFeedbackResponse)
@handle_errors
async def update_judge_feedback(
    project_id: int,
    feedback_id: int,
    feedback_data: JudgeFeedbackUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update judge feedback"""
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Get feedback
    feedback = db.query(JudgeFeedback).filter(
        JudgeFeedback.id == feedback_id,
        JudgeFeedback.project_id == project_id
    ).first()

    if not feedback:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Judge feedback not found"
        )

    # Update fields
    if feedback_data.human_score is not None:
        feedback.human_score = feedback_data.human_score
        # Recalculate alignment score
        feedback.alignment_score = judge_reliability_service.calculate_alignment_score(
            feedback.judge_score,
            feedback_data.human_score
        )

    if feedback_data.comment is not None:
        feedback.comment = feedback_data.comment
    if feedback_data.correction_reason is not None:
        feedback.correction_reason = feedback_data.correction_reason
    if feedback_data.metadata is not None:
        feedback.extra_metadata = feedback_data.metadata

    # Commit handled automatically by get_db() dependency
    db.refresh(feedback)

    logger.info(f"Judge feedback updated: {feedback_id} by user {current_user.id}")

    return feedback


@router.get("/projects/{project_id}/judge/reliability", response_model=JudgeReliabilityMetricsResponse)
@handle_errors
async def get_judge_reliability_metrics(
    project_id: int,
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get judge reliability metrics for a project"""
    # Verify project access
    check_project_access(project_id, current_user, db)

    metrics = judge_reliability_service.get_judge_reliability_metrics(project_id, db, days)

    return metrics


@router.post("/projects/{project_id}/judge/meta-validate/{evaluation_id}")
@handle_errors
async def run_meta_validation(
    project_id: int,
    evaluation_id: int,
    primary_judge_model: str = Query(..., description="Primary Judge model"),
    secondary_judge_model: str = Query(..., description="Secondary Judge model for validation"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run meta-validation using a different Judge model"""
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Verify evaluation belongs to project
    evaluation = db.query(QualityScore).filter(
        QualityScore.id == evaluation_id,
        QualityScore.project_id == project_id
    ).first()

    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation not found"
        )

    result = await judge_reliability_service.run_meta_validation(
        evaluation_id,
        primary_judge_model,
        secondary_judge_model,
        db
    )

    return result
