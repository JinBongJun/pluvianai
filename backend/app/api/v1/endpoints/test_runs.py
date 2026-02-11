
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any
from app.api.deps import get_current_user_project
from app.models.project import Project
from app.schemas.test_run import TestRunCreate, TestRunResponse

router = APIRouter()

@router.post("/runs", response_model=TestRunResponse)
async def create_test_run(
    project_id: int,
    run_data: Dict[str, Any] = Body(...),
    # current_project: Project = Depends(get_current_user_project) # Auth temporarily disabled for dev speed if needed
):
    """
    Execute a Test Lab graph.
    Recieves nodes and edges, topologically sorts them, and executes the chain.
    """
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
