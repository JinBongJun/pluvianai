from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Query, Form
from sqlalchemy.orm import Session
import csv
import io

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.core.test_limits import check_test_run_limits, check_concurrent_test_runs
from app.models.user import User
from app.models.test_result import TestResult
from app.services.test_lab_service import TestLabService, MAX_BOXES_PER_CANVAS


router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic-style request/response models (lightweight to keep file focused)
# ---------------------------------------------------------------------------


def _serialize_canvas(canvas) -> Dict[str, Any]:
    return {
        "id": canvas.id,
        "project_id": canvas.project_id,
        "name": canvas.name,
        "boxes": canvas.boxes or [],
        "connections": canvas.connections or [],
        "created_at": canvas.created_at,
        "updated_at": canvas.updated_at,
    }


def _serialize_result(result) -> Dict[str, Any]:
    return {
        "id": result.id,
        "project_id": result.project_id,
        "agent_id": result.agent_id,
        "test_run_id": result.test_run_id,
        "step_order": result.step_order,
        "parent_step_id": result.parent_step_id,
        "is_parallel": result.is_parallel,
        "input": result.input,
        "system_prompt": result.system_prompt,
        "model": result.model,
        "response": result.response,
        "latency_ms": result.latency_ms,
        "tokens_used": result.tokens_used,
        "cost": float(result.cost) if result.cost is not None else None,
        "signal_result": result.signal_result,
        "is_worst": result.is_worst,
        "worst_status": result.worst_status,
        "baseline_snapshot_id": result.baseline_snapshot_id,
        "baseline_response": result.baseline_response,
        "source": result.source,
        "created_at": result.created_at,
    }


# ---------------------------------------------------------------------------
# Canvas API (Phase 5.1)
# ---------------------------------------------------------------------------


@router.get("/projects/{project_id}/test-lab/canvases")
def list_canvases(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List Test Lab canvases for a project.
    """
    check_project_access(project_id, current_user, db)
    service = TestLabService(db)
    canvases = service.list_canvases(project_id)
    return {"items": [_serialize_canvas(c) for c in canvases]}


@router.post(
    "/projects/{project_id}/test-lab/canvases",
    status_code=status.HTTP_201_CREATED,
)
def create_canvas(
    project_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new Test Lab canvas.

    Expected JSON body:
    {
      "name": "My Canvas",
      "boxes": [...],        # Optional, max 30
      "connections": [...]   # Optional
    }
    """
    check_project_access(project_id, current_user, db)
    name = payload.get("name")
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Canvas name is required",
        )

    boxes = payload.get("boxes") or []
    connections = payload.get("connections") or []

    service = TestLabService(db)
    canvas = service.create_canvas(
        project_id=project_id,
        name=name,
        boxes=boxes,
        connections=connections,
    )
    return _serialize_canvas(canvas)


@router.put("/projects/{project_id}/test-lab/canvases/{canvas_id}")
def update_canvas(
    project_id: int,
    canvas_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update an existing Test Lab canvas (name, boxes, connections).
    """
    check_project_access(project_id, current_user, db)
    name = payload.get("name")
    boxes = payload.get("boxes")
    connections = payload.get("connections")

    service = TestLabService(db)
    canvas = service.update_canvas(
        project_id=project_id,
        canvas_id=canvas_id,
        name=name,
        boxes=boxes,
        connections=connections,
    )
    return _serialize_canvas(canvas)


# ---------------------------------------------------------------------------
# Execution API (Phase 5.2 - stubbed runner for now)
# ---------------------------------------------------------------------------


@router.post("/projects/{project_id}/test-lab/run")
async def run_test_lab(
    project_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger a Test Lab run for a canvas.

    This is a minimal synchronous implementation that:
    - Performs plan limit checks based on provided inputs.
    - Creates a TestRun row.
    - (Future) Delegates to a dedicated TestLabRunner to execute the chain
      and persist TestResult rows.

    Expected JSON body (initial version):
    {
      "name": "Run name",
      "test_type": "chain",
      "canvas_id": "uuid",
      "input_prompts": ["..."]  # used only for limit checks for now
    }
    """
    check_project_access(project_id, current_user, db)
    service = TestLabService(db)

    name = payload.get("name") or "Test Lab Run"
    test_type = payload.get("test_type") or "chain"
    canvas_id = payload.get("canvas_id")
    input_prompts: List[str] = payload.get("input_prompts") or []
    target_box_ids: Optional[List[str]] = payload.get("box_ids") or None

    if not canvas_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="canvas_id is required",
        )

    canvas = service.get_canvas(project_id, canvas_id)
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found",
        )

    # Plan limits: estimated calls = num_boxes * num_inputs (best-effort)
    box_count = len(canvas.boxes or [])
    input_count = len(input_prompts) if input_prompts else 1
    estimated_calls = box_count * input_count if box_count > 0 else input_count

    check_test_run_limits(
        db=db,
        user_id=current_user.id,
        input_count=input_count,
        estimated_calls=estimated_calls,
    )
    # Concurrency guard: only one running test (Replay/Test Lab) per user
    check_concurrent_test_runs(db, current_user.id)

    run = service.create_test_run(
        project_id=project_id,
        name=name,
        test_type=test_type,
        agent_config={"canvas_id": canvas_id, "box_count": box_count},
        signal_config=None,
    )

    # Minimal synchronous execution: create synthetic TestResult records
    # so that Test Lab flows can traverse persisted results. Full LLM
    # integration and SignalEngine wiring will extend this runner.
    await service.run_chain_synchronously(
        project_id=project_id,
        run=run,
        canvas=canvas,
        input_prompts=input_prompts,
        target_box_ids=target_box_ids,
    )

    return {
        "id": run.id,
        "project_id": run.project_id,
        "name": run.name,
        "test_type": run.test_type,
        "total_count": run.total_count,
        "pass_count": run.pass_count,
        "fail_count": run.fail_count,
        "created_at": run.created_at,
        "estimated_calls": estimated_calls,
    }


@router.get("/projects/{project_id}/test-lab/runs/{run_id}")
def get_test_lab_run(
    project_id: int,
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch TestRun metadata (and, in future, aggregated status).
    """
    check_project_access(project_id, current_user, db)
    service = TestLabService(db)
    run = service.get_test_run(project_id, run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found",
        )

    return {
        "id": run.id,
        "project_id": run.project_id,
        "name": run.name,
        "test_type": run.test_type,
        "total_count": run.total_count,
        "pass_count": run.pass_count,
        "fail_count": run.fail_count,
        "created_at": run.created_at,
    }


# ---------------------------------------------------------------------------
# Results & Worst APIs (Phase 5.4)
# ---------------------------------------------------------------------------


@router.get("/projects/{project_id}/test-lab/results")
def list_test_lab_results(
    project_id: int,
    agent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    is_worst: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Paginated Test Lab results view backed by test_results.
    """
    check_project_access(project_id, current_user, db)
    service = TestLabService(db)
    items, total = service.list_results(
        project_id=project_id,
        agent_id=agent_id,
        run_id=run_id,
        is_worst=is_worst,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [_serialize_result(r) for r in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/projects/{project_id}/test-lab/results/save")
def save_test_lab_results(
    project_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mark Test Lab results as persisted for a given run.

    Per design/API spec, this endpoint currently acts as an idempotent
    acknowledgement layer: it ensures that the referenced TestResult rows
    exist and returns the count. The actual TestResult records are created
    by Test Lab execution (run endpoint / replay/regression), so there is
    no additional mutation required here.
    """
    check_project_access(project_id, current_user, db)

    test_run_id: Optional[str] = payload.get("test_run_id")
    result_ids: List[str] = payload.get("result_ids") or []

    if not test_run_id and not result_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either test_run_id or result_ids must be provided",
        )

    query = db.query(TestResult).filter(TestResult.project_id == project_id)

    # Limit to Test Lab / chain_test sources, as other sources (replay,
    # regression) have their own save flows.
    query = query.filter(TestResult.source.in_(["test_lab", "chain_test"]))

    if test_run_id:
        query = query.filter(TestResult.test_run_id == test_run_id)
    if result_ids:
        query = query.filter(TestResult.id.in_(result_ids))

    saved_count = query.count()

    return {"data": {"saved": saved_count}}


@router.post("/projects/{project_id}/test-lab/results/mark-worst")
def mark_test_lab_result_worst(
    project_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mark a Test Lab result as worst (wrapper around TestResult flags).
    """
    check_project_access(
        project_id,
        current_user,
        db,
        required_roles=[ProjectRole.ADMIN, ProjectRole.OWNER],
    )

    # Support both single-id and multi-id payloads for flexibility:
    # - {"result_id": "res_1", "worst_status": "unreviewed"}
    # - {"result_ids": ["res_1", "res_2"], "worst_status": "unreviewed"}
    single_id = payload.get("result_id")
    ids_from_array: List[str] = payload.get("result_ids") or []
    worst_status = payload.get("worst_status") or "unreviewed"

    result_ids: List[str] = []
    if single_id:
        result_ids.append(single_id)
    result_ids.extend([rid for rid in ids_from_array if rid])

    if not result_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one result_id is required",
        )

    service = TestLabService(db)

    marked_results: List[Dict[str, Any]] = []
    for rid in result_ids:
        result = service.mark_result_worst(
            project_id=project_id,
            result_id=rid,
            worst_status=worst_status,
        )
        marked_results.append(_serialize_result(result))

    return {"data": {"marked": len(marked_results), "items": marked_results}}


# ---------------------------------------------------------------------------
# CSV Import (Phase 5.4.4)
# ---------------------------------------------------------------------------


@router.post("/projects/{project_id}/test-lab/import-csv")
async def import_test_data_csv(
    project_id: int,
    file: UploadFile = File(...),
    input_column: str = Form(..., description="CSV column name to use as input"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Parse a CSV file and extract input rows for Test Lab.

    This endpoint intentionally does not persist rows itself; instead, it
    validates and normalizes inputs so the frontend can attach them to
    specific boxes/canvases and persist via the canvas PUT endpoint.

    Returns a lightweight preview so the UI can:
    - Show detected headers
    - Render a small sample table
    - Display imported/skipped counts
    """
    check_project_access(project_id, current_user, db)

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must be UTF-8 encoded",
        )

    reader = csv.DictReader(io.StringIO(text))
    if input_column not in reader.fieldnames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Input column '{input_column}' not found in CSV header",
        )

    headers: List[str] = reader.fieldnames or []
    inputs: List[str] = []
    skipped = 0
    preview_rows: List[Dict[str, Any]] = []
    max_preview_rows = 20

    row_index = 0
    for row in reader:
        if row_index < max_preview_rows:
            # Shallow copy so we don't accidentally mutate DictReader internals
            preview_rows.append({key: row.get(key) for key in headers})
        row_index += 1

        value = (row.get(input_column) or "").strip()
        if not value:
            skipped += 1
            continue
        inputs.append(value)

    return {
        "headers": headers,
        "preview_rows": preview_rows,
        "imported_count": len(inputs),
        "skipped_count": skipped,
        "inputs": inputs,
    }


@router.post("/projects/{project_id}/test-lab/import-langchain")
async def import_langchain_agent(
    project_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Import a LangChain agent/chain into Test Lab.

    Accepts either:
    1. LangChain agent code as a string (will be parsed to extract structure)
    2. Pre-structured JSON representation of LangChain agent

    Expected JSON body:
    {
      "code": "...",  # Optional: LangChain Python code
      "agent_config": {...},  # Optional: Pre-structured agent config
      "format": "code" | "json"  # Format of input
    }

    Returns boxes and connections that can be added to a Test Lab canvas.
    """
    check_project_access(project_id, current_user, db)
    service = TestLabService(db)

    format_type = payload.get("format", "code")
    code = payload.get("code", "")
    agent_config = payload.get("agent_config")

    if format_type == "code" and not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LangChain code is required when format is 'code'",
        )
    if format_type == "json" and not agent_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent config is required when format is 'json'",
        )

    try:
        if format_type == "code":
            # Parse LangChain code to extract agent structure
            boxes, connections = service.parse_langchain_code(code)
        else:
            # Convert pre-structured JSON to Test Lab format
            boxes, connections = service.convert_langchain_config(agent_config)

        return {
            "boxes": boxes,
            "connections": connections,
            "box_count": len(boxes),
            "connection_count": len(connections),
        }
    except Exception as e:
        logger.error(
            "Failed to import LangChain agent",
            extra={"project_id": project_id, "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse LangChain agent: {str(e)}",
        )

