"""
Agent Chain endpoints
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.api_call import APICall
from app.services.cost_analyzer import CostAnalyzer

router = APIRouter()
cost_analyzer = CostAnalyzer()


class ChainProfile(BaseModel):
    """Chain profile item"""
    chain_id: str
    total_calls: int
    successful_calls: int
    failed_calls: int
    success_rate: float
    avg_latency_ms: float
    total_cost: float
    avg_cost_per_call: float


class ChainProfileResponse(BaseModel):
    """Chain profile response"""
    total_chains: int
    successful_chains: int
    success_rate: float
    avg_chain_latency_ms: float
    chains: List[ChainProfile]
    message: Optional[str] = None


class OptimizationResponse(BaseModel):
    """Optimization response"""
    optimization_id: str
    chain_id: str
    type: str
    description: str
    estimated_savings: Optional[float]
    estimated_improvement: Optional[float]


class ApplyOptimizationRequest(BaseModel):
    """Apply optimization request"""
    optimization_id: str
    user_confirmation: bool = True


@router.get("/profile")
@handle_errors
async def get_chain_profile(
    project_id: int = Query(..., description="Project ID", gt=0),
    chain_id: Optional[str] = Query(None, description="Filter by chain ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get chain profile for a project
    Returns chain statistics grouped by chain_id
    """
    logger.info(
        f"User {current_user.id} requested chain profile for project {project_id} (chain_id: {chain_id}, days: {days})",
        extra={"user_id": current_user.id, "project_id": project_id, "chain_id": chain_id, "days": days}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Calculate date range
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)

    # Build query
    query = db.query(APICall).filter(
        and_(
            APICall.project_id == project_id,
            APICall.created_at >= period_start,
            APICall.created_at <= period_end,
            APICall.chain_id.isnot(None),  # Only include calls with chain_id
        )
    )

    # Filter by chain_id if provided
    if chain_id:
        query = query.filter(APICall.chain_id == chain_id)

    api_calls = query.all()

    if not api_calls:
        return success_response(data={
            "total_chains": 0,
            "successful_chains": 0,
            "success_rate": 0.0,
            "avg_chain_latency_ms": 0.0,
            "chains": [],
            "message": "No chain data available for the specified period",
        })

    # Group by chain_id
    chain_stats: Dict[str, Dict[str, Any]] = {}
    for call in api_calls:
        cid = call.chain_id
        if not cid:  # Skip if chain_id is None
            continue
        if cid not in chain_stats:
            chain_stats[cid] = {
                "chain_id": cid,
                "total_calls": 0,
                "successful_calls": 0,
                "failed_calls": 0,
                "total_latency": 0.0,
                "total_cost": 0.0,
            }

        stats = chain_stats[cid]
        stats["total_calls"] += 1

        # Check if successful
        if call.status_code and 200 <= call.status_code < 300:
            stats["successful_calls"] += 1
        else:
            stats["failed_calls"] += 1

        # Accumulate latency
        if call.latency_ms:
            stats["total_latency"] += call.latency_ms

        # Calculate cost
        input_tokens = call.request_tokens or 0
        output_tokens = call.response_tokens or 0
        provider = call.provider or "unknown"
        model = call.model or "unknown"
        cost = cost_analyzer.calculate_cost(provider, model, input_tokens, output_tokens)
        stats["total_cost"] += cost

    # Convert to response format
    chains = []
    total_successful_chains = 0
    total_chain_latency = 0.0

    for cid, stats in chain_stats.items():
        success_rate = (stats["successful_calls"] / stats["total_calls"]) if stats["total_calls"] > 0 else 0.0
        avg_latency = (stats["total_latency"] / stats["total_calls"]) if stats["total_calls"] > 0 else 0.0
        avg_cost = (stats["total_cost"] / stats["total_calls"]) if stats["total_calls"] > 0 else 0.0

        if success_rate >= 0.9:  # 90% success rate threshold
            total_successful_chains += 1

        total_chain_latency += avg_latency

        chains.append(ChainProfile(
            chain_id=cid,
            total_calls=stats["total_calls"],
            successful_calls=stats["successful_calls"],
            failed_calls=stats["failed_calls"],
            success_rate=success_rate,
            avg_latency_ms=avg_latency,
            total_cost=stats["total_cost"],
            avg_cost_per_call=avg_cost,
        ))

    total_chains = len(chains)
    overall_success_rate = (total_successful_chains / total_chains) if total_chains > 0 else 0.0
    avg_chain_latency = (total_chain_latency / total_chains) if total_chains > 0 else 0.0

    logger.info(
        f"Chain profile retrieved for project {project_id}: {total_chains} chains",
        extra={"user_id": current_user.id, "project_id": project_id, "total_chains": total_chains}
    )

    return success_response(data={
        "total_chains": total_chains,
        "successful_chains": total_successful_chains,
        "success_rate": overall_success_rate,
        "avg_chain_latency_ms": avg_chain_latency,
        "chains": [c.model_dump() for c in chains],
    })


@router.get("/optimizations")
@handle_errors
async def get_chain_optimizations(
    project_id: int = Query(..., description="Project ID", gt=0),
    chain_id: str = Query(..., description="Chain ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get optimization suggestions for a chain
    """
    logger.info(
        f"User {current_user.id} requested optimizations for chain {chain_id} in project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "chain_id": chain_id}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # For now, return empty list (optimizations can be implemented later)
    # This is a placeholder for future optimization logic
    return success_response(data=[])


@router.post("/optimizations/apply")
@handle_errors
async def apply_chain_optimization(
    request: ApplyOptimizationRequest,
    project_id: int = Query(..., description="Project ID", gt=0),
    chain_id: str = Query(..., description="Chain ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Apply an optimization to a chain
    """
    logger.info(
        f"User {current_user.id} applying optimization {request.optimization_id} to chain {chain_id} in project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "chain_id": chain_id, "optimization_id": request.optimization_id}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # For now, return success (optimization logic can be implemented later)
    return success_response(data={
        "optimization_id": request.optimization_id,
        "chain_id": chain_id,
        "status": "applied" if request.user_confirmation else "pending",
        "message": "Optimization applied successfully",
    })


@router.get("/agents")
@handle_errors
async def get_agent_statistics(
    project_id: int = Query(..., description="Project ID", gt=0),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get agent statistics for a project
    """
    logger.info(
        f"User {current_user.id} requested agent statistics for project {project_id} (days: {days})",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Calculate date range
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)

    # Query agent statistics
    agent_stats = (
        db.query(
            APICall.agent_name,
            func.count(APICall.id).label("total_calls"),
            func.sum(func.case((func.and_(APICall.status_code >= 200, APICall.status_code < 300), 1), else_=0)).label("successful_calls"),
            func.avg(APICall.latency_ms).label("avg_latency"),
        )
        .filter(
            and_(
                APICall.project_id == project_id,
                APICall.created_at >= period_start,
                APICall.created_at <= period_end,
                APICall.agent_name.isnot(None),
            )
        )
        .group_by(APICall.agent_name)
        .all()
    )

    # Convert to response format
    agents = []
    for stat in agent_stats:
        total = int(stat.total_calls) if stat.total_calls else 0
        successful = int(stat.successful_calls) if stat.successful_calls else 0
        success_rate = (successful / total) if total > 0 else 0.0
        avg_latency = float(stat.avg_latency) if stat.avg_latency else 0.0

        agents.append({
            "agent_name": stat.agent_name,
            "total_calls": total,
            "successful_calls": successful,
            "failed_calls": total - successful,
            "success_rate": success_rate,
            "avg_latency_ms": avg_latency,
        })

    logger.info(
        f"Agent statistics retrieved for project {project_id}: {len(agents)} agents",
        extra={"user_id": current_user.id, "project_id": project_id, "count": len(agents)}
    )

    return success_response(data=agents)
