from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.models.user import User
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.services.replay_service import replay_service

router = APIRouter()

class ReplayRequest(BaseModel):
    snapshot_ids: List[int]
    new_model: Optional[str] = None
    new_system_prompt: Optional[str] = None

class ReplayResponseItem(BaseModel):
    snapshot_id: int
    success: bool
    status_code: Optional[int] = None
    replay_model: Optional[str] = None
    error: Optional[str] = None
    # We omit full response data here for brevity in the list view

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

    # Fetch snapshots
    snapshots = db.query(Snapshot).join(Trace).filter(
        Snapshot.id.in_(data.snapshot_ids),
        Trace.project_id == project_id
    ).all()

    if not snapshots:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No valid snapshots found for this project")

    # Run Replay
    results = await replay_service.run_batch_replay(
        snapshots=snapshots,
        new_model=data.new_model,
        new_system_prompt=data.new_system_prompt
    )

    return results
