from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.core.test_limits import check_test_run_limits
from app.models.user import User
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.services.replay_service import replay_service

router = APIRouter()

class ReplayRequest(BaseModel):
    snapshot_ids: List[int]
    new_model: Optional[str] = None
    new_system_prompt: Optional[str] = None
    rubric_id: Optional[int] = None
    judge_model: Optional[str] = "gpt-4o-mini"

class ReplayResponseItem(BaseModel):
    snapshot_id: int
    success: bool
    status_code: Optional[int] = None
    replay_model: Optional[str] = None
    error: Optional[str] = None
    # Judge Evaluation results
    evaluation: Optional[dict] = None
    # Regression detection flag (from AI Judge evaluation)
    regression_detected: Optional[bool] = None

@router.post("/{project_id}/run", response_model=List[ReplayResponseItem])
async def trigger_replay(
    project_id: int,
    data: ReplayRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Run a batch replay test for specified snapshots"""
    # Verify access
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.ADMIN, ProjectRole.OWNER, ProjectRole.MEMBER])

    # Plan limit check: input count and estimated calls (1 call per snapshot)
    check_test_run_limits(
        db,
        current_user.id,
        input_count=len(data.snapshot_ids),
        estimated_calls=len(data.snapshot_ids),
    )

    # Fetch snapshots using repository
    from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
    from app.infrastructure.repositories.trace_repository import TraceRepository
    from app.infrastructure.repositories.evaluation_rubric_repository import EvaluationRubricRepository
    
    snapshot_repo = SnapshotRepository(db)
    trace_repo = TraceRepository(db)
    rubric_repo = EvaluationRubricRepository(db)
    
    # Fetch snapshots by IDs and verify they belong to the project
    all_snapshots = []
    for snapshot_id in data.snapshot_ids:
        snapshot = snapshot_repo.find_by_id(snapshot_id)
        if snapshot:
            # Verify snapshot belongs to project via trace
            trace = trace_repo.find_by_id(snapshot.trace_id)
            if trace and trace.project_id == project_id:
                all_snapshots.append(snapshot)
    
    if not all_snapshots:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No valid snapshots found for this project")

    # Fetch Rubric if requested
    rubric = None
    if data.rubric_id:
        rubric = rubric_repo.find_by_id(data.rubric_id)
        if rubric and rubric.project_id != project_id:
            rubric = None

    # Run Replay
    results = await replay_service.run_batch_replay(
        project_id=project_id,
        db=db,
        snapshots=all_snapshots,
        new_model=data.new_model,
        new_system_prompt=data.new_system_prompt,
        rubric=rubric,
        judge_model=data.judge_model
    )

    # Extract regression_detected from evaluation if present
    for result in results:
        if result.get("evaluation") and isinstance(result["evaluation"], dict):
            result["regression_detected"] = result["evaluation"].get("regression_detected")

    return results
