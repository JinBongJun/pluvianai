"""
Agent Chain Profiler endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.project import Project
from app.services.agent_chain_profiler import AgentChainProfiler
from app.services.subscription_service import SubscriptionService

router = APIRouter()

profiler = AgentChainProfiler()


@router.get("/profile")
async def profile_chain(
    project_id: int = Query(..., description="Project ID"),
    chain_id: str | None = Query(None, description="Specific chain ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Profile agent chains"""
    # Verify project access (any member can view agent chains)
    project = check_project_access(project_id, current_user, db)
    
    # Check feature access (Agent Chain Profiler requires Pro plan or higher)
    subscription_service = SubscriptionService(db)
    if not subscription_service.check_feature_access(project.owner_id, "agent_chain_profiler"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent Chain Profiler requires Pro plan or higher. Please upgrade your subscription."
        )
    
    # Profile chains
    profile = profiler.profile_chain(
        project_id=project_id,
        chain_id=chain_id,
        days=days,
        db=db
    )
    
    return profile


@router.get("/agents")
async def get_agent_statistics(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get statistics for all agents"""
    # Verify project access (any member can view agent chains)
    project = check_project_access(project_id, current_user, db)
    
    # Check feature access (Agent Chain Profiler requires Pro plan or higher)
    subscription_service = SubscriptionService(db)
    if not subscription_service.check_feature_access(project.owner_id, "agent_chain_profiler"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent Chain Profiler requires Pro plan or higher. Please upgrade your subscription."
        )
    
    # Get agent statistics
    stats = profiler.get_agent_statistics(
        project_id=project_id,
        days=days,
        db=db
    )
    
    return stats



