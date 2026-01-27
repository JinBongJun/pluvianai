"""
Model Validation endpoints for One-Click model safety testing
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.project import Project
from app.services.golden_case_service import GoldenCaseService
from app.services.replay_service import ReplayService
from app.services.judge_service import judge_service
from app.core.dependencies import get_snapshot_repository
from app.infrastructure.repositories.snapshot_repository import SnapshotRepository

router = APIRouter()

# Allowed models per provider (following SECURITY_GUIDE.md input validation)
ALLOWED_MODELS = {
    "openai": ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-4o-mini"],
    "anthropic": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku", "claude-3-5-sonnet"],
    "google": ["gemini-pro", "gemini-pro-vision"],
}

ALLOWED_PROVIDERS = list(ALLOWED_MODELS.keys())


class ModelValidationRequest(BaseModel):
    """Request schema for model validation with input validation"""
    new_model: str = Field(..., description="Model name to validate", min_length=1, max_length=100)
    provider: str = Field("openai", description="LLM provider")
    rubric_id: Optional[int] = Field(None, description="Optional rubric ID for evaluation")
    
    @validator('provider')
    def validate_provider(cls, v):
        """Validate provider is in allowed list (following SECURITY_GUIDE.md)"""
        if v not in ALLOWED_PROVIDERS:
            raise ValueError(f"Provider must be one of {ALLOWED_PROVIDERS}")
        return v
    
    @validator('new_model')
    def validate_model(cls, v, values):
        """Validate model is allowed for the provider (following SECURITY_GUIDE.md)"""
        provider = values.get('provider', 'openai')
        allowed = ALLOWED_MODELS.get(provider, [])
        if v not in allowed:
            raise ValueError(f"Model '{v}' is not allowed for provider '{provider}'. Allowed models: {allowed}")
        return v


class ModelValidationResponse(BaseModel):
    """Response schema for model validation"""
    safe: bool
    average_score: float
    score_drop_percentage: Optional[float]
    total_tested: int
    passed: int
    failed: int
    summary: str
    details: List[Dict[str, Any]]


@router.post("/projects/{project_id}/validate-model")
@handle_errors
async def validate_model(
    project_id: int,
    request: ModelValidationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    snapshot_repo: SnapshotRepository = Depends(get_snapshot_repository),
):
    """
    One-Click model validation: Test new model safety using last 100 snapshots
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        f"User {current_user.id} requested model validation for project {project_id}: {request.new_model} ({request.provider})",
        extra={
            "user_id": current_user.id,
            "project_id": project_id,
            "model": request.new_model,
            "provider": request.provider,
            "rubric_id": request.rubric_id,
        }
    )
    
    # Check project access
    project = check_project_access(project_id, current_user, db)
    
    # Extract golden cases (last 100 snapshots)
    golden_case_service = GoldenCaseService(snapshot_repo, db)
    test_cases = golden_case_service.extract_golden_cases(project_id, limit=100)
    
    if not test_cases:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No snapshots available for testing. Create some API calls first.",
        )

    # Run batch replay with new model
    replay_service = ReplayService()
    
    # Get rubric if provided
    rubric = None
    if request.rubric_id:
        from app.models.evaluation_rubric import EvaluationRubric
        rubric = db.query(EvaluationRubric).filter(
            EvaluationRubric.id == request.rubric_id,
            EvaluationRubric.project_id == project_id
        ).first()
        if not rubric:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rubric not found",
            )

    # Replay all test cases with new model
    replay_results = await replay_service.run_batch_replay(
        project_id=project_id,
        db=db,
        snapshots=test_cases,
        new_model=request.new_model,
        rubric=rubric,
    )

    # Analyze results
    total_tested = len(replay_results)
    passed = sum(1 for r in replay_results if r.get("success", False))
    failed = total_tested - passed

    # Calculate scores if rubric was provided
    scores = []
    score_drop = None
    details = []

    if rubric:
        # Get original scores (would need to be stored or re-evaluated)
        # For now, assume we're comparing against baseline
        for result in replay_results:
            if result.get("success") and "judge_evaluation" in result:
                eval_data = result["judge_evaluation"]
                if isinstance(eval_data, dict) and "error" not in eval_data:
                    score = eval_data.get("replayed_score", 0)
                    scores.append(score)
                    
                    details.append({
                        "snapshot_id": result.get("snapshot_id"),
                        "score": score,
                        "regression_detected": eval_data.get("regression_detected", False),
                        "reasoning": eval_data.get("reasoning", ""),
                    })

        if scores:
            average_score = sum(scores) / len(scores)
            # Assume baseline is 4.5 (would be calculated from original snapshots)
            baseline_score = 4.5
            score_drop = ((baseline_score - average_score) / baseline_score) * 100 if baseline_score > 0 else 0
            
            # Determine if safe (less than 15% drop)
            safe = score_drop < 15.0
        else:
            average_score = 0.0
            safe = False
    else:
        # Without rubric, just check success rate
        average_score = (passed / total_tested * 5.0) if total_tested > 0 else 0.0
        safe = passed >= (total_tested * 0.8)  # 80% success rate threshold
        details = [
            {
                "snapshot_id": r.get("snapshot_id"),
                "success": r.get("success", False),
                "error": r.get("error"),
            }
            for r in replay_results
        ]

    # Generate summary message
    if safe:
        summary = f"✅ Safe to deploy. Average score: {average_score:.2f}/5.0"
        if score_drop is not None:
            summary += f" ({score_drop:.1f}% change from baseline)"
    else:
        summary = f"❌ Risky deployment. Average score: {average_score:.2f}/5.0"
        if score_drop is not None:
            summary += f" ({score_drop:.1f}% drop from baseline)"
        summary += f". {failed} out of {total_tested} tests failed."

    result = ModelValidationResponse(
        safe=safe,
        average_score=average_score,
        score_drop_percentage=score_drop,
        total_tested=total_tested,
        passed=passed,
        failed=failed,
        summary=summary,
        details=details[:10],  # Return top 10 details
    )

    logger.info(
        f"Model validation completed for project {project_id}: {result.summary}",
        extra={
            "user_id": current_user.id,
            "project_id": project_id,
            "model": request.new_model,
            "safe": safe,
            "total_tested": total_tested,
            "passed": passed,
            "failed": failed,
        }
    )

    # Return using standard response format
    return success_response(data=result.dict())
