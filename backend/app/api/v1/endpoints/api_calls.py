"""
API Call endpoints with caching optimization
"""

from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func, case
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user, get_user_from_api_key
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.core.dependencies import get_api_call_service, get_snapshot_repository
from app.services.data_normalizer import DataNormalizer
from app.services.background_tasks import background_task_service
from app.models.user import User
from app.models.api_call import APICall
from app.services.cache_service import cache_service
from app.utils.compression import decompress_json

router = APIRouter()


class APICallResponse(BaseModel):
    """API Call response schema"""

    id: int
    project_id: int
    provider: str
    model: str
    request_tokens: Optional[int]
    response_tokens: Optional[int]
    latency_ms: Optional[float]
    status_code: Optional[int]
    agent_name: Optional[str]
    chain_id: Optional[str]
    created_at: datetime
    response_text: Optional[str] = None

    class Config:
        from_attributes = True


class APICallDetailResponse(APICallResponse):
    """Detailed API Call response schema"""

    request_data: dict
    response_data: dict
    error_message: Optional[str]
    snapshot_id: Optional[int] = None


@router.get("", response_model=List[APICallResponse])
@handle_errors
async def list_api_calls(
    project_id: int = Query(..., description="Project ID"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    provider: Optional[str] = None,
    model: Optional[str] = None,
    agent_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    api_call_service = Depends(get_api_call_service),
):
    """List API calls for a project with caching"""
    # Verify project access (any member can view)
    check_project_access(project_id, current_user, db)

    # Generate cache key
    cache_key = cache_service.api_calls_key(project_id, limit)
    if provider:
        cache_key += f":{provider}"
    if model:
        cache_key += f":{model}"
    if agent_name:
        cache_key += f":{agent_name}"
    cache_key += f":{offset}"

    # Try to get from cache (only for first page, no filters)
    if offset == 0 and not provider and not model and not agent_name:
        cached = cache_service.get(cache_key)
        if cached:
            return cached

    # Use service to get API calls
    api_calls = api_call_service.get_api_calls_by_project_id(
        project_id=project_id,
        limit=limit,
        offset=offset,
        provider=provider,
        model=model,
        agent_name=agent_name
    )

    # Cache result (only for first page, no filters, TTL 5 minutes)
    if offset == 0 and not provider and not model and not agent_name:
        cache_service.set(cache_key, api_calls, ttl=300)

    return api_calls


class StreamRecentResponse(BaseModel):
    """Stream recent API calls + live stats for Streaming UI"""

    items: List[APICallResponse]
    last_1m_count: int
    last_5m_count: int


@router.get("/stream/recent", response_model=StreamRecentResponse)
@handle_errors
async def stream_recent(
    project_id: int = Query(..., description="Project ID", gt=0),
    limit: int = Query(25, ge=1, le=100, description="Max items to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    api_call_service = Depends(get_api_call_service),
):
    """Recent API calls + last-1m/5m counts for LiveStreamView and PulseIndicator. Poll every 2–3s."""
    check_project_access(project_id, current_user, db)
    now = datetime.utcnow()
    t1 = now - timedelta(minutes=1)
    t5 = now - timedelta(minutes=5)

    recent = api_call_service.get_api_calls_by_project_id(
        project_id=project_id, limit=limit, offset=0, provider=None, model=None, agent_name=None
    )
    c1 = (
        db.query(func.count(APICall.id))
        .filter(and_(APICall.project_id == project_id, APICall.created_at >= t1, APICall.created_at <= now))
        .scalar()
        or 0
    )
    c5 = (
        db.query(func.count(APICall.id))
        .filter(and_(APICall.project_id == project_id, APICall.created_at >= t5, APICall.created_at <= now))
        .scalar()
        or 0
    )
    return StreamRecentResponse(items=recent, last_1m_count=int(c1), last_5m_count=int(c5))


@router.get("/stream/live")
@handle_errors
async def stream_live(
    project_id: int = Query(..., description="Project ID", gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Server-Sent Events (SSE) stream for real-time API call monitoring
    Returns live updates every 2-3 seconds with recent API calls and statistics
    """
    from fastapi.responses import StreamingResponse
    import json
    import asyncio
    
    check_project_access(project_id, current_user, db)
    
    async def event_generator():
        """Generate SSE events with live API call data"""
        last_count = 0
        
        while True:
            try:
                # Get current time windows
                now = datetime.utcnow()
                t1 = now - timedelta(minutes=1)
                t5 = now - timedelta(minutes=5)
                
                # Get recent API calls
                recent_calls = (
                    db.query(APICall)
                    .filter(
                        and_(
                            APICall.project_id == project_id,
                            APICall.created_at >= now - timedelta(minutes=5)
                        )
                    )
                    .order_by(APICall.created_at.desc())
                    .limit(25)
                    .all()
                )
                
                # Count calls in time windows
                c1 = (
                    db.query(func.count(APICall.id))
                    .filter(and_(APICall.project_id == project_id, APICall.created_at >= t1, APICall.created_at <= now))
                    .scalar() or 0
                )
                c5 = (
                    db.query(func.count(APICall.id))
                    .filter(and_(APICall.project_id == project_id, APICall.created_at >= t5, APICall.created_at <= now))
                    .scalar() or 0
                )
                
                # Convert to response format
                items = [
                    {
                        "id": call.id,
                        "provider": call.provider,
                        "model": call.model,
                        "agent_name": call.agent_name,
                        "status_code": call.status_code,
                        "latency_ms": call.latency_ms,
                        "created_at": call.created_at.isoformat() if call.created_at else None,
                    }
                    for call in recent_calls
                ]
                
                # Only send if there are new calls (optimization)
                current_count = len(recent_calls)
                if current_count != last_count or True:  # Always send for now
                    data = {
                        "items": items,
                        "last_1m_count": int(c1),
                        "last_5m_count": int(c5),
                        "timestamp": now.isoformat(),
                    }
                    
                    # Format as SSE
                    yield f"data: {json.dumps(data)}\n\n"
                    last_count = current_count
                
                # Wait 2-3 seconds before next update
                await asyncio.sleep(2.5)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in live stream: {str(e)}")
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                await asyncio.sleep(5)  # Wait longer on error
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@router.get("/by-id/{api_call_id}", response_model=APICallDetailResponse)
async def get_api_call(
    api_call_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    api_call_service = Depends(get_api_call_service),
    snapshot_repo = Depends(get_snapshot_repository),
):
    """Get a specific API call with decompression by ID"""
    api_call = api_call_service.get_api_call_by_id(api_call_id)

    if not api_call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API call not found")

    # Verify project access (any member can view)
    project = check_project_access(api_call.project_id, current_user, db)

    # Decompress data if compressed
    if isinstance(api_call.request_data, dict) and "compressed" in api_call.request_data:
        api_call.request_data = decompress_json(api_call.request_data["compressed"]) or {}

    if isinstance(api_call.response_data, dict) and "compressed" in api_call.response_data:
        api_call.response_data = decompress_json(api_call.response_data["compressed"]) or {}

    # Attach snapshot_id if it exists (for Replay navigation)
    # We match by trace_id (chain_id in APICall table)
    snapshot = None
    if api_call.chain_id:
        snapshots = snapshot_repo.find_by_trace_id(api_call.chain_id)
        if snapshots:
            snapshot = snapshots[0]  # Get first snapshot for the trace
    
    # We use a custom object to include the snapshot_id
    response_data = APICallDetailResponse.from_orm(api_call)
    if snapshot:
        response_data.snapshot_id = snapshot.id

    return response_data


class APICallCreateRequest(BaseModel):
    """SDK에서 보내는 API Call 생성 요청"""

    project_id: int
    request_data: dict
    response_data: dict
    latency_ms: float
    status_code: int
    agent_name: Optional[str] = None
    chain_id: Optional[str] = None


class APICallStatsResponse(BaseModel):
    """API Call statistics response schema"""

    total_calls: int
    successful_calls: int
    failed_calls: int
    success_rate: float  # 0.0 to 1.0
    period_start: datetime
    period_end: datetime


@router.get("/stats")
@handle_errors
async def get_api_call_stats(
    project_id: int = Query(..., description="Project ID", gt=0),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get API call statistics including success rate for a project
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(f"🔵 GET API CALL STATS: project_id={project_id}, days={days}, user_id={current_user.id}")
    logger.info(
        f"User {current_user.id} requested API call stats for project {project_id} (days: {days})",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )
    # Verify project access (any member can view)
    check_project_access(project_id, current_user, db)

    # Calculate date range
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)

    # Query statistics
    stats = (
        db.query(
            func.count(APICall.id).label("total_calls"),
            func.sum(
                case(
                    (and_(APICall.status_code >= 200, APICall.status_code < 300), 1),
                    else_=0,
                )
            ).label("successful_calls"),
        )
        .filter(
            APICall.project_id == project_id,
            APICall.created_at >= period_start,
            APICall.created_at <= period_end,
        )
        .first()
    )

    # Handle None stats result
    if stats is None:
        result = APICallStatsResponse(
            total_calls=0,
            successful_calls=0,
            failed_calls=0,
            success_rate=0.0,
            period_start=period_start,
            period_end=period_end,
        )
        logger.info(
            f"API call stats retrieved for project {project_id}: no data found",
            extra={"user_id": current_user.id, "project_id": project_id}
        )
        return success_response(data=result.model_dump())

    total_calls = int(stats.total_calls) if stats.total_calls else 0
    successful_calls = int(stats.successful_calls) if stats.successful_calls else 0
    failed_calls = total_calls - successful_calls
    success_rate = (successful_calls / total_calls) if total_calls > 0 else 0.0

    result = APICallStatsResponse(
        total_calls=total_calls,
        successful_calls=successful_calls,
        failed_calls=failed_calls,
        success_rate=success_rate,
        period_start=period_start,
        period_end=period_end,
    )

    logger.info(
        f"API call stats retrieved for project {project_id}: total={result.total_calls}, success_rate={result.success_rate:.2%}",
        extra={"user_id": current_user.id, "project_id": project_id, "total_calls": result.total_calls}
    )

    # Return using standard response format
    return success_response(data=result.model_dump())


@router.post("", response_model=APICallResponse, status_code=status.HTTP_201_CREATED)
async def create_api_call(
    api_call_data: APICallCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_user_from_api_key),  # API Key 인증
):
    """
    SDK에서 직접 API Call 데이터를 전송하는 엔드포인트

    사용 방법:
    POST /api/v1/api-calls
    Headers:
      Authorization: Bearer ag_live_xxxxx
    Body:
      {
        "project_id": 1,
        "request_data": {...},
        "response_data": {...},
        "latency_ms": 123.45,
        "status_code": 200,
        "agent_name": "router",
        "chain_id": "uuid-optional"
      }

    특징:
    - SDK에서 직접 호출 (Proxy 없이)
    - API Key 인증 (JWT 토큰 불필요)
    - 비동기 저장 (non-blocking)
    - 자동 데이터 정규화
    """
    # Verify project access
    check_project_access(api_call_data.project_id, user, db)

    # Normalize data (SDK는 URL이 없으므로 빈 문자열 전달)
    normalizer = DataNormalizer()
    normalized = normalizer.normalize(
        request_data=api_call_data.request_data,
        response_data=api_call_data.response_data,
        url="",  # SDK 직접 모드에서는 URL 없음
    )

    # Extract provider and model (fallback if not detected)
    provider = normalized.get("provider", "unknown")
    model = normalized.get("model", "unknown")

    # If provider is unknown, try to detect from model name
    if provider == "unknown" and model != "unknown":
        # Try to detect from model name
        model_lower = model.lower()
        if any(x in model_lower for x in ["gpt", "o1", "text-", "davinci"]):
            provider = "openai"
        elif any(x in model_lower for x in ["claude", "sonnet", "opus", "haiku"]):
            provider = "anthropic"
        elif any(x in model_lower for x in ["gemini", "palm", "bison"]):
            provider = "google"

    # If still unknown, try to detect from request_data structure
    if provider == "unknown":
        request_data = api_call_data.request_data
        if isinstance(request_data, dict):
            # OpenAI format: has "messages" with role/content structure
            if "messages" in request_data:
                messages = request_data.get("messages", [])
                if messages and isinstance(messages[0], dict) and "role" in messages[0]:
                    provider = "openai"  # Default to OpenAI for standard format
            # Anthropic format: has "messages" with different structure or "model" starts with claude
            if "model" in request_data:
                model_name = str(request_data["model"]).lower()
                if "claude" in model_name:
                    provider = "anthropic"

    # Save to database asynchronously (non-blocking)
    # This prevents blocking the SDK request
    try:
        await background_task_service.save_api_call_async(
            project_id=api_call_data.project_id,
            request_data=api_call_data.request_data,
            response_data=api_call_data.response_data,
            normalized=normalized,
            latency_ms=api_call_data.latency_ms,
            status_code=api_call_data.status_code,
            agent_name=api_call_data.agent_name,
            chain_id=api_call_data.chain_id,
        )
    except Exception as e:
        # Log error but don't fail (SDK is non-blocking)
        # In production, use proper logging
        print(f"Error scheduling API call save: {e}")

    # Return immediate response (don't wait for save)
    # Note: id is 0 because it's saved asynchronously
    return APICallResponse(
        id=0,  # Background에서 생성되므로 임시값
        project_id=api_call_data.project_id,
        provider=provider,
        model=model,
        request_tokens=normalized.get("request_tokens"),
        response_tokens=normalized.get("response_tokens"),
        latency_ms=api_call_data.latency_ms,
        status_code=api_call_data.status_code,
        agent_name=api_call_data.agent_name,
        chain_id=api_call_data.chain_id,
        created_at=datetime.utcnow(),
    )
