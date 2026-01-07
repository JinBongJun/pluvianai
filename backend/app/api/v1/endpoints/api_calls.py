"""
API Call endpoints with caching optimization
"""
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.project import Project
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
    
    class Config:
        from_attributes = True


class APICallDetailResponse(APICallResponse):
    """Detailed API Call response schema"""
    request_data: dict
    response_data: dict
    error_message: Optional[str]


@router.get("", response_model=List[APICallResponse])
async def list_api_calls(
    project_id: int = Query(..., description="Project ID"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    provider: Optional[str] = None,
    model: Optional[str] = None,
    agent_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List API calls for a project with caching"""
    # Verify project access (any member can view)
    project = check_project_access(project_id, current_user, db)
    
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
    
    # Build query
    query = db.query(APICall).filter(APICall.project_id == project_id)
    
    if provider:
        query = query.filter(APICall.provider == provider)
    if model:
        query = query.filter(APICall.model == model)
    if agent_name:
        query = query.filter(APICall.agent_name == agent_name)
    
    # Order by created_at descending and paginate
    api_calls = query.order_by(desc(APICall.created_at)).offset(offset).limit(limit).all()
    
    # Cache result (only for first page, no filters, TTL 5 minutes)
    if offset == 0 and not provider and not model and not agent_name:
        cache_service.set(cache_key, api_calls, ttl=300)
    
    return api_calls


@router.get("/{api_call_id}", response_model=APICallDetailResponse)
async def get_api_call(
    api_call_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific API call with decompression"""
    api_call = db.query(APICall).filter(APICall.id == api_call_id).first()
    
    if not api_call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API call not found"
        )
    
    # Verify project access (any member can view)
    project = check_project_access(api_call.project_id, current_user, db)
    
    # Decompress data if compressed
    if isinstance(api_call.request_data, dict) and "compressed" in api_call.request_data:
        api_call.request_data = decompress_json(api_call.request_data["compressed"]) or {}
    
    if isinstance(api_call.response_data, dict) and "compressed" in api_call.response_data:
        api_call.response_data = decompress_json(api_call.response_data["compressed"]) or {}
    
    return api_call


class APICallStatsResponse(BaseModel):
    """API Call statistics response schema"""
    total_calls: int
    successful_calls: int
    failed_calls: int
    success_rate: float  # 0.0 to 1.0
    period_start: datetime
    period_end: datetime


@router.get("/stats", response_model=APICallStatsResponse)
async def get_api_call_stats(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get API call statistics including success rate for a project"""
    # #region agent log
    import json
    try:
        with open('c:\\Users\\user\\Desktop\\AgentGuard\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"H1.3","location":"api_calls.py:136","message":"get_api_call_stats entry","data":{"project_id":project_id,"days":days,"user_id":current_user.id},"timestamp":int(__import__('time').time()*1000)})+'\n')
    except: pass
    # #endregion
    
    # Verify project access (any member can view)
    project = check_project_access(project_id, current_user, db)
    
    # Calculate date range
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)
    
    # Query statistics
    stats = db.query(
        func.count(APICall.id).label('total_calls'),
        func.sum(
            func.case(
                (func.and_(
                    APICall.status_code >= 200,
                    APICall.status_code < 300
                ), 1),
                else_=0
            )
        ).label('successful_calls')
    ).filter(
        APICall.project_id == project_id,
        APICall.created_at >= period_start,
        APICall.created_at <= period_end
    ).first()
    
    # #region agent log
    try:
        with open('c:\\Users\\user\\Desktop\\AgentGuard\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"H1.1","location":"api_calls.py:167","message":"After database query","data":{"stats_is_none":stats is None,"total_calls":int(stats.total_calls) if stats and stats.total_calls else 0},"timestamp":int(__import__('time').time()*1000)})+'\n')
    except: pass
    # #endregion
    
    # Handle None stats result
    if stats is None:
        return APICallStatsResponse(
            total_calls=0,
            successful_calls=0,
            failed_calls=0,
            success_rate=0.0,
            period_start=period_start,
            period_end=period_end
        )
    
    total_calls = int(stats.total_calls) if stats.total_calls else 0
    successful_calls = int(stats.successful_calls) if stats.successful_calls else 0
    failed_calls = total_calls - successful_calls
    success_rate = (successful_calls / total_calls) if total_calls > 0 else 0.0
    
    return APICallStatsResponse(
        total_calls=total_calls,
        successful_calls=successful_calls,
        failed_calls=failed_calls,
        success_rate=success_rate,
        period_start=period_start,
        period_end=period_end
    )


