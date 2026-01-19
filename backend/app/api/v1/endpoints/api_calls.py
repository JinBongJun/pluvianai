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
from app.core.security import get_current_user, get_user_from_api_key
from app.core.permissions import check_project_access
from app.services.data_normalizer import DataNormalizer
from app.services.background_tasks import background_task_service
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
    try:
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
    except Exception as e:
        from app.core.logging_config import logger
        logger.error(f"Error listing API calls for project {project_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve API calls: {str(e)}"
        )


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


@router.get("/stats", response_model=APICallStatsResponse)
async def get_api_call_stats(
    project_id: int = Query(..., description="Project ID", gt=0),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get API call statistics including success rate for a project"""
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


@router.post("", response_model=APICallResponse, status_code=status.HTTP_201_CREATED)
async def create_api_call(
    api_call_data: APICallCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_user_from_api_key)  # API Key 인증
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
    project = check_project_access(api_call_data.project_id, user, db)
    
    # Normalize data (SDK는 URL이 없으므로 빈 문자열 전달)
    normalizer = DataNormalizer()
    normalized = normalizer.normalize(
        request_data=api_call_data.request_data,
        response_data=api_call_data.response_data,
        url=""  # SDK 직접 모드에서는 URL 없음
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
            chain_id=api_call_data.chain_id
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
        created_at=datetime.utcnow()
    )
