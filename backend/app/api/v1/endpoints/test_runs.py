
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import check_project_access
from app.core.security import get_current_user
from app.schemas.test_run import TestRunCreate, TestRunResponse
from app.models.user import User

router = APIRouter()

@router.post("/runs", response_model=TestRunResponse)
async def create_test_run(
    project_id: int,
    run_data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Execute a Test Lab graph.
    Recieves nodes and edges, topologically sorts them, and executes the chain.
    """
    check_project_access(project_id, current_user, db)
    print(f"Received Test Run for Project {project_id}")
    print(f"Nodes: {len(run_data.get('nodes', []))}, Edges: {len(run_data.get('edges', []))}")
    
    # 1. Validation (Stub)
    if not run_data.get('nodes'):
        raise HTTPException(status_code=400, detail="Empty canvas")

    # 2. Execution Logic (Stub - Phase 7 Implementation)
    # This will evnetually call GraphRunner.execute(run_data)
    
    return {
        "id": "run_" + str(project_id) + "_12345",
        "status": "queued",
        "project_id": project_id,
        "results": [] # Initial empty results
    }
