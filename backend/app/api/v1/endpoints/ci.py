"""
CI/CD validation endpoints for Production Guard
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user, get_user_from_api_key
from app.core.decorators import handle_errors
from app.models.user import User
from app.models.project import Project
from app.services.replay_service import ReplayService
from app.core.logging_config import logger
import uuid
from datetime import datetime

router = APIRouter()


class CIValidationRequest(BaseModel):
    """Schema for CI validation request"""
    project_id: int
    new_model: Optional[str] = None
    provider: Optional[str] = None
    rubric_id: Optional[int] = None
    timeout: int = Field(default=60, ge=10, le=300)  # 10-300 seconds
    skip_on_failure: bool = True


class CIValidationResponse(BaseModel):
    """Schema for CI validation response"""
    validation_id: str
    status: str  # "pending", "running", "completed", "failed", "timeout"
    passed: Optional[bool] = None
    score: Optional[float] = None
    message: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    created_at: str


class CIValidationStatus(BaseModel):
    """Schema for validation status"""
    validation_id: str
    status: str
    passed: Optional[bool] = None
    score: Optional[float] = None
    message: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    created_at: str
    completed_at: Optional[str] = None


# In-memory store for validation status (in production, use Redis or DB)
_validation_store: Dict[str, Dict[str, Any]] = {}


@router.post("/ci/validate", response_model=CIValidationResponse)
@handle_errors
async def validate_ci(
    request: CIValidationRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Validate model performance in CI/CD pipeline
    
    This endpoint is called from CI/CD pipelines (GitHub Actions, etc.)
    to validate that a new model meets quality thresholds.
    """
    # Authenticate via API key or Bearer token
    user = None
    if x_api_key:
        user = get_user_from_api_key(x_api_key, db)
    elif authorization:
        from app.core.security import decode_token
        token = authorization.replace("Bearer ", "")
        user_data = decode_token(token)
        if user_data:
            user = db.query(User).filter(User.id == user_data.get("sub")).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )

    # Verify project access
    project = db.query(Project).filter(Project.id == request.project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Check if user has access to project
    if project.owner_id != user.id:
        from app.models.project_member import ProjectMember
        member = db.query(ProjectMember).filter(
            ProjectMember.project_id == request.project_id,
            ProjectMember.user_id == user.id
        ).first()
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this project"
            )

    # Generate validation ID
    validation_id = str(uuid.uuid4())
    
    # Store initial status
    _validation_store[validation_id] = {
        "validation_id": validation_id,
        "status": "pending",
        "project_id": request.project_id,
        "created_at": datetime.utcnow().isoformat(),
        "timeout": request.timeout,
        "skip_on_failure": request.skip_on_failure,
    }

    # Start validation asynchronously with timeout
    try:
        import asyncio
        import time
        from app.services.replay_service import ReplayService
        from app.services.golden_case_service import GoldenCaseService
        from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
        from app.models.evaluation_rubric import EvaluationRubric
        
        start_time = time.time()
        
        # Update status to running
        _validation_store[validation_id].update({
            "status": "running"
        })
        
        # Get rubric if provided
        rubric = None
        if request.rubric_id:
            rubric = db.query(EvaluationRubric).filter(
                EvaluationRubric.id == request.rubric_id,
                EvaluationRubric.project_id == request.project_id,
                EvaluationRubric.is_active == True
            ).first()
        
        # Get golden cases (recent snapshots)
        snapshot_repo = SnapshotRepository(db)
        golden_case_service = GoldenCaseService(snapshot_repo, db)
        test_snapshots = golden_case_service.extract_golden_cases(request.project_id, limit=100)
        
        if not test_snapshots:
            raise ValueError("No test cases available. Please ensure there are snapshots for this project.")
        
        # Initialize ReplayService
        replay_service = ReplayService()
        
        # Run validation with timeout
        async def run_validation():
            if request.new_model:
                # Test new model against golden cases
                results = await replay_service.run_batch_replay(
                    snapshots=test_snapshots,
                    new_model=request.new_model,
                    rubric=rubric,
                    judge_model="gpt-4o-mini",
                    project_id=request.project_id,
                    db=db
                )
            else:
                # Run replay with existing model (baseline test)
                results = await replay_service.run_batch_replay(
                    snapshots=test_snapshots,
                    rubric=rubric,
                    project_id=request.project_id,
                    db=db,
                    judge_model="gpt-4o-mini"
                )
            
            # Calculate average score
            scores = []
            for result in results:
                if result.get("success") and result.get("judge_evaluation"):
                    eval_data = result.get("judge_evaluation", {})
                    if isinstance(eval_data, dict) and "score" in eval_data:
                        scores.append(eval_data["score"])
            
            if not scores:
                # If no scores, check success rate
                success_count = sum(1 for r in results if r.get("success"))
                success_rate = success_count / len(results) if results else 0
                avg_score = success_rate * 100  # Convert to 0-100 scale
            else:
                avg_score = sum(scores) / len(scores) if scores else 0
            
            # Determine pass/fail (threshold: 70% or average score >= 3.5/5)
            passed = avg_score >= 70.0 if scores else len([r for r in results if r.get("success")]) >= len(results) * 0.8
            
            return {
                "passed": passed,
                "score": avg_score,
                "total_tested": len(results),
                "successful": len([r for r in results if r.get("success")])
            }
        
        # Run with timeout
        try:
            validation_result = await asyncio.wait_for(
                run_validation(),
                timeout=request.timeout
            )
            passed = validation_result["passed"]
            score = validation_result["score"]
        except asyncio.TimeoutError:
            _validation_store[validation_id].update({
                "status": "timeout",
                "message": f"Validation timed out after {request.timeout} seconds",
                "completed_at": datetime.utcnow().isoformat(),
            })
            
            if request.skip_on_failure:
                return CIValidationResponse(
                    validation_id=validation_id,
                    status="timeout",
                    passed=False,
                    message=f"Validation timed out after {request.timeout} seconds",
                    created_at=_validation_store[validation_id]["created_at"]
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_408_REQUEST_TIMEOUT,
                    detail=f"Validation timed out after {request.timeout} seconds"
                )

        elapsed = time.time() - start_time

        # Update status
        _validation_store[validation_id].update({
            "status": "completed",
            "passed": passed,
            "score": score,
            "elapsed_seconds": elapsed,
            "completed_at": datetime.utcnow().isoformat(),
        })

        return CIValidationResponse(
            validation_id=validation_id,
            status="completed",
            passed=passed,
            score=score,
            elapsed_seconds=elapsed,
            created_at=_validation_store[validation_id]["created_at"]
        )

    except Exception as e:
        logger.error(f"CI validation failed: {str(e)}")
        _validation_store[validation_id].update({
            "status": "failed",
            "message": str(e),
            "completed_at": datetime.utcnow().isoformat(),
        })
        
        if request.skip_on_failure:
            return CIValidationResponse(
                validation_id=validation_id,
                status="failed",
                passed=False,
                message=str(e),
                created_at=_validation_store[validation_id]["created_at"]
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Validation failed: {str(e)}"
            )


@router.get("/ci/status/{validation_id}", response_model=CIValidationStatus)
@handle_errors
async def get_validation_status(
    validation_id: str,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get validation status by ID"""
    # Authenticate
    user = None
    if x_api_key:
        user = get_user_from_api_key(x_api_key, db)
    elif authorization:
        from app.core.security import decode_token
        token = authorization.replace("Bearer ", "")
        user_data = decode_token(token)
        if user_data:
            user = db.query(User).filter(User.id == user_data.get("sub")).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )

    # Get validation status
    validation = _validation_store.get(validation_id)
    if not validation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Validation not found"
        )

    # Verify user has access to the project
    project_id = validation.get("project_id")
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project and project.owner_id != user.id:
            from app.models.project_member import ProjectMember
            member = db.query(ProjectMember).filter(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id
            ).first()
            if not member:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )

    return CIValidationStatus(**validation)
