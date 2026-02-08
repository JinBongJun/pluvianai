from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.services.quality_evaluator import QualityEvaluator
from app.models.api_call import APICall
from app.models.quality_score import QualityScore

router = APIRouter()

class EvaluationRequest(BaseModel):
    api_call_id: int
    expected_schema: Optional[Dict[str, Any]] = None
    required_fields: Optional[List[str]] = None
    use_advanced: bool = False

@router.post("/evaluate")
def evaluate_quality(
    payload: EvaluationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evaluate the quality of a specific API call."""
    api_call = db.query(APICall).filter(APICall.id == payload.api_call_id).first()
    if not api_call:
        raise HTTPException(status_code=404, detail="API call not found")
    
    check_project_access(api_call.project_id, current_user, db)
    
    evaluator = QualityEvaluator()
    score = evaluator.evaluate(
        api_call=api_call,
        expected_schema=payload.expected_schema,
        required_fields=payload.required_fields,
        use_advanced=payload.use_advanced
    )
    
    db.add(score)
    db.commit()
    db.refresh(score)
    
    return score

@router.get("/scores")
def get_quality_scores(
    project_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get recent quality scores for a project."""
    check_project_access(project_id, current_user, db)
    
    scores = db.query(QualityScore).filter(
        QualityScore.project_id == project_id
    ).order_by(QualityScore.created_at.desc()).limit(limit).all()
    
    return scores

@router.get("/stats")
def get_quality_stats(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get quality statistics for a project."""
    check_project_access(project_id, current_user, db)
    
    from sqlalchemy import func
    
    stats = db.query(
        func.avg(QualityScore.overall_score).label("avg_score"),
        func.count(QualityScore.id).label("total_evaluations")
    ).filter(QualityScore.project_id == project_id).first()
    
    return {
        "average_score": float(stats.avg_score or 0),
        "total_evaluations": stats.total_evaluations or 0
    }
