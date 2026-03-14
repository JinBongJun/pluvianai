import asyncio
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status, Body
from pydantic import BaseModel, Field
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.dependencies import get_api_call_service
from app.models.user import User
from app.core.permissions import check_project_access
from app.services.data_normalizer import DataNormalizer
from app.services.background_tasks import background_task_service
from app.services.ops_alerting import ops_alerting

router = APIRouter()


class APICallIngestBody(BaseModel):
    """SDK ingest: same shape as SDK sends."""
    project_id: int = Field(..., description="Project ID")
    request_data: Dict[str, Any] = Field(default_factory=dict, description="LLM request payload")
    response_data: Dict[str, Any] = Field(default_factory=dict, description="LLM response payload")
    latency_ms: float = Field(0.0, description="Latency in ms")
    status_code: int = Field(200, description="HTTP status code")
    agent_name: Optional[str] = None
    chain_id: Optional[str] = None


class APICallResponse(BaseModel):
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

    class Config:
        from_attributes = True

@router.get("", response_model=List[APICallResponse])
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


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def ingest_api_call(
    body: APICallIngestBody = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Ingest a single API call from the SDK (no proxy).
    Creates APICall + Snapshot so Live View shows the run.
    Auth: Bearer token; project_id must be accessible by current user.
    """
    check_project_access(body.project_id, current_user, db)
    normalizer = DataNormalizer()
    normalized = normalizer.normalize(
        request_data=body.request_data or {},
        response_data=body.response_data or {},
        url="",
    )
    asyncio.create_task(
        background_task_service.save_api_call_async(
            project_id=body.project_id,
            request_data=body.request_data or {},
            response_data=body.response_data or {},
            normalized=normalized,
            latency_ms=body.latency_ms,
            status_code=body.status_code,
            agent_name=body.agent_name,
            chain_id=body.chain_id,
            api_key=None,
        )
    )
    ops_alerting.observe_snapshot_status(project_id=body.project_id, status_code=int(body.status_code))
    return {"accepted": True}


@router.get("/by-id/{id}", response_model=APICallResponse)
def get_api_call(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    api_call_service = Depends(get_api_call_service),
):
    """Get a specific API call by ID."""
    call = api_call_service.get_api_call_by_id(id)
    if not call:
        raise HTTPException(status_code=404, detail="API call not found")
    
    check_project_access(call.project_id, current_user, db)
    
    return call

@router.get("/stats")
def get_api_call_stats(
    project_id: int,
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get API call statistics for a project."""
    check_project_access(project_id, current_user, db)
    
    # Minimal implementation for now to satisfy frontend
    from datetime import datetime, timedelta
    from sqlalchemy import func
    from app.models.api_call import APICall
    
    since = datetime.utcnow() - timedelta(days=days)
    
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

@router.get("/stream/recent")
def stream_recent_api_calls(
    project_id: int,
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    api_call_service = Depends(get_api_call_service),
):
    """Get recent API calls for streaming UI."""
    check_project_access(project_id, current_user, db)
    
    calls = api_call_service.get_api_calls_by_project_id(
        project_id=project_id,
        limit=limit
    )
    
    return {
        "items": calls,
        "last_1m": 0, # Placeholder
        "last_5m": 0  # Placeholder
    }
