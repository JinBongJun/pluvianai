"""
Quality evaluation endpoints

Updated: 2026-01-27
- Added status-based evaluation (SAFE / REGRESSED / CRITICAL)
- Signal-based detection instead of LLM-as-Judge
- Kept legacy score-based endpoints for backward compatibility
"""

from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.feature_access import check_feature_access
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.project import Project
from app.models.quality_score import QualityScore
from app.models.api_call import APICall
from app.services.quality_evaluator import QualityEvaluator
from app.services.subscription_service import SubscriptionService
from app.services.signal_detection_service import SignalDetectionService
from app.services.regression_service import RegressionService

router = APIRouter()

evaluator = QualityEvaluator()


# ============================================
# NEW: Status-based evaluation (Signal-based)
# ============================================

class StatusCheckRequest(BaseModel):
    """Request for status-based evaluation"""
    response_text: str = Field(..., description="Response text to check")
    request_data: Optional[dict] = None
    response_data: Optional[dict] = None
    baseline_response: Optional[str] = None


class StatusCheckResponse(BaseModel):
    """Response for status-based evaluation"""
    status: str  # safe / regressed / critical
    signals: List[dict]
    signal_count: int
    critical_count: int
    high_count: int
    message: str


class ProjectStatusSummary(BaseModel):
    """Project status summary"""
    status: str
    pending_reviews: int
    recent_failures: int
    worst_prompts_count: int
    message: str


@router.post("/status-check")
@handle_errors
async def check_status(
    project_id: int = Query(..., description="Project ID"),
    request: StatusCheckRequest = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Check response status using signal-based detection
    
    Returns status: SAFE / REGRESSED / CRITICAL
    Based on detected signals, not LLM scores.
    """
    logger.info(
        f"User {current_user.id} requested status check for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id}
    )
    
    # Verify project access
    project = check_project_access(project_id, current_user, db)
    
    # Use regression service for status check
    regression_service = RegressionService(db)
    result = regression_service.check_single_response(
        project_id=project_id,
        response_text=request.response_text,
        request_data=request.request_data,
        response_data=request.response_data,
        baseline_response=request.baseline_response,
    )
    
    db.commit()
    
    # Build response with message
    status_messages = {
        "safe": "All systems operational. No issues detected.",
        "regressed": "Some issues detected. Review recommended.",
        "critical": "Critical issues detected. Do not deploy without review.",
    }
    
    response = StatusCheckResponse(
        status=result["status"],
        signals=result["signals"],
        signal_count=result["signal_count"],
        critical_count=result["critical_count"],
        high_count=result["high_count"],
        message=status_messages.get(result["status"], "Unknown status"),
    )
    
    return success_response(data=response.model_dump())


@router.get("/project-status")
@handle_errors
async def get_project_status(
    project_id: int = Query(..., description="Project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current project status summary
    
    Returns overall health status based on:
    - Recent reviews
    - Detected signals
    - Worst prompts count
    """
    logger.info(
        f"User {current_user.id} requested project status for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id}
    )
    
    # Verify project access
    project = check_project_access(project_id, current_user, db)
    
    # Use regression service for status
    regression_service = RegressionService(db)
    full_status = regression_service.get_project_regression_status(project_id)
    
    # Simplified summary
    review_stats = full_status.get("review_stats", {})
    worst_stats = full_status.get("worst_prompt_stats", {})
    current_status = full_status.get("current_status", "safe")
    
    status_messages = {
        "safe": "All systems operational. No regressions detected.",
        "regressed": "Some issues detected. Review recommended before deployment.",
        "critical": "Critical issues detected. Do not deploy without review.",
    }
    
    summary = ProjectStatusSummary(
        status=current_status,
        pending_reviews=review_stats.get("pending", 0),
        recent_failures=review_stats.get("by_regression_status", {}).get("critical", 0),
        worst_prompts_count=worst_stats.get("active", 0),
        message=status_messages.get(current_status, "Unknown status"),
    )
    
    return success_response(data=summary.model_dump())


# ============================================
# LEGACY: Score-based evaluation (kept for backward compatibility)
# ============================================


class QualityScoreResponse(BaseModel):
    """Quality score response schema with transparent breakdown"""

    id: int
    api_call_id: int
    project_id: int
    overall_score: float
    semantic_consistency_score: float | None
    tone_score: float | None
    coherence_score: float | None
    json_valid: bool | None
    required_fields_present: bool | None
    evaluation_details: dict | None = None  # Score breakdown and weights
    created_at: datetime

    class Config:
        from_attributes = True


class QualityStatsResponse(BaseModel):
    """Quality statistics response schema"""

    average_score: float
    min_score: float
    max_score: float
    total_evaluations: int
    period_start: datetime
    period_end: datetime


class EvaluateRequest(BaseModel):
    """Request to evaluate API calls"""

    api_call_ids: List[int] | None = None  # If None, evaluate recent calls
    expected_schema: dict | None = None
    required_fields: List[str] | None = None


@router.post("/evaluate")
@handle_errors
async def evaluate_quality(
    project_id: int = Query(..., description="Project ID"),
    request: EvaluateRequest = EvaluateRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Evaluate quality of API calls
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        f"User {current_user.id} requested quality evaluation for project {project_id}",
        extra={
            "user_id": current_user.id,
            "project_id": project_id,
            "api_call_ids": request.api_call_ids,
            "has_schema": request.expected_schema is not None,
        }
    )
    
    # Verify project access (any member can evaluate)
    project = check_project_access(project_id, current_user, db)

    # Check if advanced quality checks are available
    # Advanced quality checks require Startup+ plan, basic checks are always available
    subscription_service = SubscriptionService(db)
    plan_info = subscription_service.get_user_plan(project.owner_id)
    use_advanced = plan_info["features"].get("quality_checks") == "advanced"
    
    # If user requests advanced features but doesn't have access, raise exception
    if request.expected_schema or request.required_fields:
        # Schema validation is an advanced feature
        check_feature_access(
            db=db,
            user_id=current_user.id,
            feature_name="quality_checks",
            required_plan="startup",
            message="Advanced quality checks (schema validation) require Startup plan or higher. Basic quality checks are available on all plans."
        )
        use_advanced = True

    # Get API calls to evaluate
    if request.api_call_ids:
        api_calls = (
            db.query(APICall).filter(APICall.id.in_(request.api_call_ids), APICall.project_id == project_id).all()
        )
    else:
        # Evaluate recent calls (last 100)
        api_calls = (
            db.query(APICall)
            .filter(APICall.project_id == project_id)
            .order_by(desc(APICall.created_at))
            .limit(100)
            .all()
        )

    if not api_calls:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No API calls found to evaluate")

    # Evaluate
    scores = evaluator.evaluate_batch(
        api_calls,
        expected_schema=request.expected_schema,
        required_fields=request.required_fields,
        db=db,
        use_advanced=use_advanced,
    )

    logger.info(
        f"Quality evaluation completed for project {project_id}: {len(scores)} scores generated",
        extra={"user_id": current_user.id, "project_id": project_id, "score_count": len(scores)}
    )

    # Return using standard response format
    return success_response(data=scores)


@router.get("/scores")
@handle_errors
async def list_quality_scores(
    project_id: int = Query(..., description="Project ID"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List quality scores for a project
    Following API_REFERENCE.md: Returns standard response format with pagination
    """
    logger.info(
        f"User {current_user.id} requested quality scores for project {project_id} (limit: {limit}, offset: {offset})",
        extra={"user_id": current_user.id, "project_id": project_id, "limit": limit, "offset": offset}
    )
    
    # Verify project access (any member can view)
    project = check_project_access(project_id, current_user, db)

    # Get total count for pagination
    total = db.query(QualityScore).filter(QualityScore.project_id == project_id).count()

    scores = (
        db.query(QualityScore)
        .filter(QualityScore.project_id == project_id)
        .order_by(desc(QualityScore.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    logger.info(
        f"Quality scores retrieved for project {project_id}: {len(scores)} scores (total: {total})",
        extra={"user_id": current_user.id, "project_id": project_id, "count": len(scores), "total": total}
    )

    # Return using standard response format with pagination
    from app.core.responses import paginated_response
    page = (offset // limit) + 1
    return paginated_response(data=scores, page=page, per_page=limit, total=total)


@router.get("/stats")
@handle_errors
async def get_quality_stats(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get quality statistics for a project
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(f"🔵 GET QUALITY STATS: project_id={project_id}, days={days}, user_id={current_user.id}")
    logger.info(
        f"User {current_user.id} requested quality stats for project {project_id} (days: {days})",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )
    
    # Verify project access (any member can view)
    project = check_project_access(project_id, current_user, db)

    # Calculate date range
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)

    # Query statistics
    stats = (
        db.query(
            func.avg(QualityScore.overall_score).label("avg_score"),
            func.min(QualityScore.overall_score).label("min_score"),
            func.max(QualityScore.overall_score).label("max_score"),
            func.count(QualityScore.id).label("count"),
        )
        .filter(
            QualityScore.project_id == project_id,
            QualityScore.created_at >= period_start,
            QualityScore.created_at <= period_end,
        )
        .first()
    )

    # Handle None stats result
    if stats is None:
        result = QualityStatsResponse(
            average_score=0.0,
            min_score=0.0,
            max_score=0.0,
            total_evaluations=0,
            period_start=period_start,
            period_end=period_end,
        )
        logger.info(
            f"Quality stats retrieved for project {project_id}: no data found",
            extra={"user_id": current_user.id, "project_id": project_id}
        )
        return success_response(data=result.model_dump())

    result = QualityStatsResponse(
        average_score=float(stats.avg_score) if stats.avg_score else 0.0,
        min_score=float(stats.min_score) if stats.min_score else 0.0,
        max_score=float(stats.max_score) if stats.max_score else 0.0,
        total_evaluations=int(stats.count) if stats.count else 0,
        period_start=period_start,
        period_end=period_end,
    )

    logger.info(
        f"Quality stats retrieved for project {project_id}: avg={result.average_score}, total={result.total_evaluations}",
        extra={"user_id": current_user.id, "project_id": project_id, "avg_score": result.average_score}
    )

    # Return using standard response format
    return success_response(data=result.model_dump())
