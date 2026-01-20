"""
Shadow Routing endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.core.decorators import handle_errors
from app.models.user import User
from app.models.project import Project
from app.services.shadow_routing_service import ShadowRoutingService

router = APIRouter()

shadow_routing_service = ShadowRoutingService()


class ApplyShadowRoutingRequest(BaseModel):
    """Request model for applying shadow routing"""
    primary_model: str
    shadow_model: str
    user_confirmation: bool = True


class RollbackRequest(BaseModel):
    """Request model for rolling back shadow routing"""
    rollback_point_id: str | None = None


@router.get("/suggestions")
@handle_errors
async def get_shadow_routing_suggestions(
    project_id: int = Query(..., description="Project ID"),
    primary_model: str = Query(..., description="Primary model name"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get shadow routing suggestions for a primary model"""
    # Verify project access
    project = check_project_access(project_id, current_user, db)
    
    # Get suggestions
    suggestions = shadow_routing_service.suggest_shadow_models(
        project_id=project_id,
        primary_model=primary_model,
        db=db
    )
    
    return suggestions


@router.post("/apply")
@handle_errors
async def apply_shadow_routing(
    project_id: int = Query(..., description="Project ID"),
    request: ApplyShadowRoutingRequest = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Apply shadow routing gradually (requires user confirmation)"""
    # Verify project access (owner/admin only)
    project = check_project_access(
        project_id, current_user, db,
        required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN]
    )
    
    # Check user confirmation
    if not request.user_confirmation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User confirmation is required to apply shadow routing"
        )
    
    # Apply gradually
    result = shadow_routing_service.apply_gradually(
        project_id=project_id,
        primary_model=request.primary_model,
        shadow_model=request.shadow_model,
        user_confirmation=request.user_confirmation,
        db=db
    )
    
    return result


@router.post("/rollback")
@handle_errors
async def rollback_shadow_routing(
    project_id: int = Query(..., description="Project ID"),
    request: RollbackRequest = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rollback shadow routing to previous state"""
    # Verify project access (owner/admin only)
    project = check_project_access(
        project_id, current_user, db,
        required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN]
    )
    
    # Get project
    project_obj = db.query(Project).filter(Project.id == project_id).first()
    if not project_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Reset shadow routing configuration
    config = project_obj.shadow_routing_config or {}
    config["enabled"] = False
    config["percentage"] = 0
    project_obj.shadow_routing_config = config
    db.commit()
    
    return {
        "status": "success",
        "message": "Shadow routing rolled back successfully",
    }
