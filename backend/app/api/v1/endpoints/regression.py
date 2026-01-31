"""
Regression API endpoints - Status determination and testing
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.models.user import User
from app.services.regression_service import RegressionService

router = APIRouter()


# Request/Response Models

class TestCase(BaseModel):
    prompt: str
    response_before: Optional[str] = None
    response_after: str
    snapshot_id: Optional[int] = None
    request_data: Optional[dict] = None
    response_data: Optional[dict] = None


class RegressionTestRequest(BaseModel):
    test_cases: List[TestCase]
    model_before: str
    model_after: str
    create_review: bool = True


class RegressionTestResponse(BaseModel):
    status: str
    model_before: str
    model_after: str
    test_count: int
    passed_count: int
    failed_count: int
    signals: dict
    review_id: Optional[int] = None
    results: List[dict]
    timestamp: str


class SingleCheckRequest(BaseModel):
    response_text: str
    request_data: Optional[dict] = None
    response_data: Optional[dict] = None
    baseline_response: Optional[str] = None


class SingleCheckResponse(BaseModel):
    status: str
    signals: List[dict]
    signal_count: int
    critical_count: int
    high_count: int


class ProjectStatusResponse(BaseModel):
    current_status: str
    review_stats: dict
    worst_prompt_stats: dict
    recent_reviews: List[dict]


# Endpoints

@router.post("/projects/{project_id}/regression/test", response_model=RegressionTestResponse)
async def run_regression_test(
    project_id: int,
    request: RegressionTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Run a complete regression test
    
    Tests multiple cases and returns overall status:
    - SAFE: No issues detected
    - REGRESSED: Some issues detected
    - CRITICAL: Critical issues detected
    
    Optionally creates a review for human decision.
    """
    project = check_project_access(project_id, current_user, db)
    
    service = RegressionService(db)
    
    # Convert test cases to dict format
    test_cases = [
        {
            "prompt": tc.prompt,
            "response_before": tc.response_before,
            "response_after": tc.response_after,
            "snapshot_id": tc.snapshot_id,
            "request_data": tc.request_data,
            "response_data": tc.response_data,
        }
        for tc in request.test_cases
    ]
    
    result = service.run_regression_test(
        project_id=project_id,
        test_cases=test_cases,
        model_before=request.model_before,
        model_after=request.model_after,
        create_review=request.create_review,
    )
    
    db.commit()
    
    return result


@router.post("/projects/{project_id}/regression/check", response_model=SingleCheckResponse)
async def check_single_response(
    project_id: int,
    request: SingleCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Check a single response for regression
    
    Quick check without creating a review.
    Returns detected signals and status.
    """
    project = check_project_access(project_id, current_user, db)
    
    service = RegressionService(db)
    result = service.check_single_response(
        project_id=project_id,
        response_text=request.response_text,
        request_data=request.request_data,
        response_data=request.response_data,
        baseline_response=request.baseline_response,
    )
    
    db.commit()
    
    return result


@router.get("/projects/{project_id}/regression/status", response_model=ProjectStatusResponse)
async def get_project_status(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get current regression status for a project
    
    Returns:
    - Current status (safe/regressed/critical)
    - Review statistics
    - Worst prompt statistics
    - Recent reviews
    """
    project = check_project_access(project_id, current_user, db)
    
    service = RegressionService(db)
    status = service.get_project_regression_status(project_id)
    
    return status


@router.get("/projects/{project_id}/regression/summary")
async def get_regression_summary(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a quick summary of regression status
    
    Returns a simplified status for dashboard display.
    """
    project = check_project_access(project_id, current_user, db)
    
    service = RegressionService(db)
    full_status = service.get_project_regression_status(project_id)
    
    # Simplified summary
    review_stats = full_status.get("review_stats", {})
    worst_stats = full_status.get("worst_prompt_stats", {})
    
    return {
        "status": full_status.get("current_status", "safe"),
        "pending_reviews": review_stats.get("pending", 0),
        "recent_failures": review_stats.get("by_regression_status", {}).get("critical", 0),
        "worst_prompts_count": worst_stats.get("active", 0),
        "message": _get_status_message(full_status.get("current_status", "safe")),
    }


def _get_status_message(status: str) -> str:
    """Get human-readable status message"""
    messages = {
        "safe": "All systems operational. No regressions detected.",
        "regressed": "Some issues detected. Review recommended before deployment.",
        "critical": "Critical issues detected. Do not deploy without review.",
        "pending": "Tests in progress. Status pending.",
    }
    return messages.get(status, "Unknown status")
