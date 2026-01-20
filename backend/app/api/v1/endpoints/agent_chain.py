"""
Agent Chain Profiler endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.models.user import User
from app.models.project import Project
from app.services.agent_chain_profiler import AgentChainProfiler
from app.services.agent_chain_optimizer import AgentChainOptimizer
from app.services.subscription_service import SubscriptionService
from app.services.cache_service import cache_service

router = APIRouter()

profiler = AgentChainProfiler()
optimizer = AgentChainOptimizer()


@router.get("/profile")
@handle_errors
async def profile_chain(
    project_id: int = Query(..., description="Project ID"),
    chain_id: str | None = Query(None, description="Specific chain ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Profile agent chains"""
    # Verify project access (any member can view agent chains)
    project = check_project_access(project_id, current_user, db)

    # Check cache first
    cache_key = f"chain_profile:{project_id}:{chain_id or 'all'}:{days}"
    cached = cache_service.get(cache_key)
    if cached:
        return cached

    # Temporarily disable subscription check during development
    # Check feature access (Agent Chain Profiler requires Pro plan or higher)
    # subscription_service = SubscriptionService(db)
    # if not subscription_service.check_feature_access(project.owner_id, "agent_chain_profiler"):
    #     raise HTTPException(
    #         status_code=status.HTTP_403_FORBIDDEN,
    #         detail="Agent Chain Profiler requires Pro plan or higher. Please upgrade your subscription."
    #     )

    # Profile chains
    profile = profiler.profile_chain(project_id=project_id, chain_id=chain_id, days=days, db=db)

    # Cache result for 5 minutes
    cache_service.set(cache_key, profile, ttl=300)

    return profile


@router.get("/agents")
@handle_errors
async def get_agent_statistics(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get statistics for all agents"""
    # Verify project access (any member can view agent chains)
    project = check_project_access(project_id, current_user, db)

    # Check cache first
    cache_key = f"agent_stats:{project_id}:{days}"
    cached = cache_service.get(cache_key)
    if cached:
        return cached

    # Temporarily disable subscription check during development
    # Check feature access (Agent Chain Profiler requires Pro plan or higher)
    # subscription_service = SubscriptionService(db)
    # if not subscription_service.check_feature_access(project.owner_id, "agent_chain_profiler"):
    #     raise HTTPException(
    #         status_code=status.HTTP_403_FORBIDDEN,
    #         detail="Agent Chain Profiler requires Pro plan or higher. Please upgrade your subscription."
    #     )

    # Get agent statistics
    stats = profiler.get_agent_statistics(project_id=project_id, days=days, db=db)

    # Cache result for 5 minutes
    cache_service.set(cache_key, stats, ttl=300)

    return stats


class ApplyOptimizationRequest(BaseModel):
    """Request model for applying optimization"""

    optimization_id: str
    user_confirmation: bool = True


@router.get("/optimizations")
@handle_errors
async def get_optimizations(
    project_id: int = Query(..., description="Project ID"),
    chain_id: str = Query(..., description="Chain ID to optimize"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get optimization suggestions for a chain"""
    # Verify project access
    project = check_project_access(project_id, current_user, db)

    # Check cache first
    cache_key = f"chain_optimizations:{project_id}:{chain_id}"
    cached = cache_service.get(cache_key)
    if cached:
        return cached

    # Get optimization suggestions
    suggestions = optimizer.suggest_optimizations(project_id=project_id, chain_id=chain_id, db=db)

    # Cache result for 10 minutes (longer than profile since it's more expensive)
    cache_service.set(cache_key, suggestions, ttl=600)

    return suggestions


@router.post("/optimizations/apply")
@handle_errors
async def apply_optimization(
    project_id: int = Query(..., description="Project ID"),
    chain_id: str = Query(..., description="Chain ID"),
    request: ApplyOptimizationRequest = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply an optimization suggestion (requires user confirmation)"""
    # Verify project access (owner/admin only for applying changes)
    from app.core.permissions import ProjectRole

    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])

    # Check user confirmation
    if not request.user_confirmation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="User confirmation is required to apply optimizations"
        )

    # For now, return a placeholder response
    # Actual implementation would apply the optimization based on optimization_id
    # This is a placeholder as we need to implement the actual application logic
    return {
        "message": "Optimization application is not yet fully implemented",
        "optimization_id": request.optimization_id,
        "status": "pending",
        "note": "This endpoint is a placeholder. Full implementation requires additional work to track and apply optimizations.",
    }
