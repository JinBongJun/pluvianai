import asyncio
import json
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status, Body
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user, get_current_user_or_api_key, RequireScope
from app.core.dependencies import get_api_call_service
from app.models.user import User
from app.core.permissions import check_project_access
from app.services.data_normalizer import DataNormalizer
from app.services.background_tasks import background_task_service
from app.services.ops_alerting import ops_alerting
from app.services.cache_service import cache_service
from app.core.logging_config import logger
from app.utils.ingest_observability import request_data_shape_summary

router = APIRouter()

# Path prefix when mounted: /projects (full path e.g. /api/v1/projects/{project_id}/api-calls)


class APICallIngestBody(BaseModel):
    """SDK ingest: same shape as SDK sends. project_id can be omitted when provided in path.

    Limits: ``tool_events`` normalized to max 50 events per call; per-event JSON size capped server-side
    (see ``app.utils.tool_events``). See ``docs/live-view-ingest-field-matrix.md``.
    """
    project_id: Optional[int] = Field(None, description="Project ID (must match path if provided)")
    request_data: Dict[str, Any] = Field(default_factory=dict, description="LLM request payload")
    response_data: Dict[str, Any] = Field(default_factory=dict, description="LLM response payload")
    latency_ms: float = Field(0.0, description="Latency in ms")
    status_code: int = Field(200, description="HTTP status code")
    agent_name: Optional[str] = None
    chain_id: Optional[str] = None
    tool_events: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Optional tool_call/tool_result/action timeline from the client (see docs/release-gate-tool-io-grounding-plan.md)",
    )


class APICallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    provider: Optional[str] = None
    model: Optional[str] = None
    agent_name: Optional[str] = None
    total_tokens: Optional[int] = None
    cost: Optional[float] = None
    latency_ms: Optional[int] = None
    status_code: Optional[int] = None
    created_at: datetime

@router.get("/{project_id}/api-calls/stats")
def get_api_call_stats(
    project_id: int,
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get API call statistics for a project."""
    check_project_access(project_id, current_user, db)
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func
    from app.models.api_call import APICall
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stats = db.query(
        func.count(APICall.id).label("total_calls"),
        func.sum(APICall.cost).label("total_cost"),
        func.avg(APICall.latency_ms).label("avg_latency")
    ).filter(
        APICall.project_id == project_id,
        APICall.created_at >= since
    ).first()
    return {
        "total_calls": stats.total_calls or 0,
        "total_cost": float(stats.total_cost or 0),
        "avg_latency": float(stats.avg_latency or 0)
    }


@router.get("/{project_id}/api-calls/stream/recent")
def stream_recent_api_calls(
    project_id: int,
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    api_call_service = Depends(get_api_call_service),
):
    """Get recent API calls for streaming UI."""
    check_project_access(project_id, current_user, db)
    calls = api_call_service.get_api_calls_by_project_id(project_id=project_id, limit=limit)
    return {"items": calls, "last_1m": 0, "last_5m": 0}


@router.get("/{project_id}/api-calls/{call_id:int}", response_model=APICallResponse)
def get_api_call(
    project_id: int,
    call_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    api_call_service = Depends(get_api_call_service),
):
    """Get a specific API call by ID; must belong to the given project."""
    check_project_access(project_id, current_user, db)
    call = api_call_service.get_api_call_by_id(call_id)
    if not call or call.project_id != project_id:
        raise HTTPException(status_code=404, detail="API call not found")
    return call


@router.get("/{project_id}/api-calls", response_model=List[APICallResponse])
def list_api_calls(
    project_id: int,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    provider: Optional[str] = None,
    model: Optional[str] = None,
    agent_name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    api_call_service = Depends(get_api_call_service),
):
    """List API calls for a project with filters."""
    check_project_access(project_id, current_user, db)
    return api_call_service.get_api_calls_by_project_id(
        project_id=project_id,
        limit=limit,
        offset=offset,
        provider=provider,
        model=model,
        agent_name=agent_name
    )


@router.post("/{project_id}/api-calls", status_code=status.HTTP_202_ACCEPTED)
async def ingest_api_call(
    project_id: int,
    body: APICallIngestBody = Body(...),
    current_user: User = Depends(get_current_user_or_api_key),
    _scope: None = Depends(RequireScope("ingest")),
    db: Session = Depends(get_db),
):
    """
    Ingest a single API call from the SDK. Creates APICall + Snapshot.
    When Redis is enabled, payload is pushed to ingest queue and a worker persists it (202 immediately).
    Otherwise, processing runs in-process (asyncio task).
    Auth: JWT or SDK API key (key must have scope 'ingest' or '*'); project_id in path must be accessible.
    """
    if body.project_id is not None and body.project_id != project_id:
        raise HTTPException(status_code=400, detail="project_id in body must match path")
    check_project_access(project_id, current_user, db)
    _shape = request_data_shape_summary(body.request_data)
    logger.info(
        "ingest_request_shape",
        extra={
            "event_type": "ingest_request_shape",
            "project_id": project_id,
            **_shape,
        },
    )
    normalizer = DataNormalizer()
    normalized = normalizer.normalize(
        request_data=body.request_data or {},
        response_data=body.response_data or {},
        url="",
    )
    if cache_service.enabled:
        payload = {
            "project_id": project_id,
            "request_data": body.request_data or {},
            "response_data": body.response_data or {},
            "normalized": normalized,
            "latency_ms": body.latency_ms,
            "status_code": body.status_code,
            "agent_name": body.agent_name,
            "chain_id": body.chain_id,
            "tool_events": body.tool_events,
        }
        try:
            cache_service.redis_client.lpush(
                settings.INGEST_QUEUE_KEY,
                json.dumps(payload, default=str),
            )
        except Exception:
            # Fallback: process in-process if queue push fails
            asyncio.create_task(
                background_task_service.save_api_call_async(
                    project_id=project_id,
                    request_data=body.request_data or {},
                    response_data=body.response_data or {},
                    normalized=normalized,
                    latency_ms=body.latency_ms,
                    status_code=body.status_code,
                    agent_name=body.agent_name,
                    chain_id=body.chain_id,
                    api_key=None,
                    tool_events=body.tool_events,
                )
            )
            ops_alerting.observe_snapshot_status(project_id=project_id, status_code=int(body.status_code))
    else:
        asyncio.create_task(
            background_task_service.save_api_call_async(
                project_id=project_id,
                request_data=body.request_data or {},
                response_data=body.response_data or {},
                normalized=normalized,
                latency_ms=body.latency_ms,
                status_code=body.status_code,
                agent_name=body.agent_name,
                chain_id=body.chain_id,
                api_key=None,
                tool_events=body.tool_events,
            )
        )
        ops_alerting.observe_snapshot_status(project_id=project_id, status_code=int(body.status_code))
    return {"accepted": True}
