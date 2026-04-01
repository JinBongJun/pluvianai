import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, check_project_write_access
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

@router.post("/{project_id}/quality/evaluate")
def evaluate_quality(
    project_id: int,
    payload: EvaluationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evaluate the quality of a specific API call."""
    check_project_write_access(project_id, current_user, db, action_label="Running quality evaluation")
    api_call = db.query(APICall).filter(APICall.id == payload.api_call_id).first()
    if not api_call:
        raise HTTPException(status_code=404, detail="API call not found")
    if api_call.project_id != project_id:
        raise HTTPException(status_code=404, detail="API call not found")

    # Backward-compat shim for older APICall schema variants.
    # QualityEvaluator expects response_data/response_text attrs.
    if not hasattr(api_call, "response_data"):
        response_content = getattr(api_call, "response_content", None)
        parsed = {}
        if isinstance(response_content, str) and response_content.strip():
            try:
                parsed = json.loads(response_content)
            except Exception:
                parsed = {}
        setattr(api_call, "response_data", parsed)
    if not hasattr(api_call, "response_text"):
        response_content = getattr(api_call, "response_content", None)
        setattr(api_call, "response_text", response_content or "")
    
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

@router.get("/{project_id}/quality/scores")
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

@router.get("/{project_id}/quality/stats")
def get_quality_stats(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get quality statistics for a project."""
    check_project_access(project_id, current_user, db)
    
    from sqlalchemy import func
    
    stats = db.query(
        func.avg(QualityScore.score).label("avg_score"),
        func.count(QualityScore.id).label("total_evaluations")
    ).filter(QualityScore.project_id == project_id).first()
    
    return {
        "average_score": float(stats.avg_score or 0),
        "total_evaluations": stats.total_evaluations or 0
    }
