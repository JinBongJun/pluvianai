"""
Shadow Routing endpoints (stub implementation)
Note: Shadow Routing has been removed per DETAILED_DESIGN.md, but endpoints are kept for backward compatibility
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User

router = APIRouter()


class ShadowRoutingSuggestion(BaseModel):
    """Shadow routing suggestion"""
    shadow_model: str
    confidence: float
    estimated_cost_savings: Optional[float]
    estimated_quality_impact: Optional[float]


class ApplyShadowRoutingRequest(BaseModel):
    """Apply shadow routing request"""
    primary_model: str
    shadow_model: str
    user_confirmation: bool = True


class RollbackShadowRoutingRequest(BaseModel):
    """Rollback shadow routing request"""
    rollback_point_id: Optional[str] = None


@router.get("/suggestions")
@handle_errors
async def get_shadow_routing_suggestions(
    project_id: int = Query(..., description="Project ID", gt=0),
    primary_model: str = Query(..., description="Primary model"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get shadow routing suggestions for a primary model
    Note: Shadow Routing has been removed - returns empty suggestions
    """
    logger.info(
        f"User {current_user.id} requested shadow routing suggestions for project {project_id}, model {primary_model}",
        extra={"user_id": current_user.id, "project_id": project_id, "primary_model": primary_model}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Return empty suggestions (Shadow Routing removed per DETAILED_DESIGN.md)
    return success_response(data=[])


@router.post("/apply")
@handle_errors
async def apply_shadow_routing(
    request: ApplyShadowRoutingRequest,
    project_id: int = Query(..., description="Project ID", gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Apply shadow routing
    Note: Shadow Routing has been removed - returns not implemented
    """
    logger.info(
        f"User {current_user.id} requested to apply shadow routing for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "primary_model": request.primary_model, "shadow_model": request.shadow_model}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Shadow Routing has been removed per DETAILED_DESIGN.md
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Shadow Routing has been removed. Please use Production Guard (Firewall) instead."
    )


@router.post("/rollback")
@handle_errors
async def rollback_shadow_routing(
    request: RollbackShadowRoutingRequest,
    project_id: int = Query(..., description="Project ID", gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Rollback shadow routing
    Note: Shadow Routing has been removed - returns not implemented
    """
    logger.info(
        f"User {current_user.id} requested to rollback shadow routing for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "rollback_point_id": request.rollback_point_id}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Shadow Routing has been removed per DETAILED_DESIGN.md
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Shadow Routing has been removed. Please use Production Guard (Firewall) instead."
    )
