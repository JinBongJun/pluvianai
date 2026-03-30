"""
Project endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from pydantic import BaseModel, ConfigDict, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole, get_user_project_role
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.dependencies import get_project_service, get_evaluation_rubric_repository, get_audit_service
from app.infrastructure.repositories.evaluation_rubric_repository import EvaluationRubricRepository
from app.services.cache_service import cache_service
from app.services.firewall_service import firewall_service
from app.services.live_view_events import publish_agents_changed
from app.middleware.usage_middleware import check_project_limit
from app.core.usage_limits import get_limit_status
from app.services.activity_logger import activity_logger
from app.core.analytics import analytics_service
from app.domain.live_view_release_gate import invalidate_agent_visibility_cache
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.validation_dataset import ValidationDataset
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError

# Repository 패턴 사용 예시 (주석으로 추가)
# from app.core.dependencies import get_project_repository
# from app.infrastructure.repositories.project_repository import ProjectRepository

router = APIRouter()


def _invalidate_project_list_caches_for_project(db: Session, project_id: int, owner_id: Optional[int]) -> None:
    user_ids = set()
    if owner_id:
        user_ids.add(int(owner_id))

    member_rows = (
        db.query(ProjectMember.user_id)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    for row in member_rows:
        if getattr(row, "user_id", None):
            user_ids.add(int(row.user_id))

    for user_id in user_ids:
        cache_service.invalidate_user_projects_cache(user_id)


class ProjectCreate(BaseModel):
    """Project creation schema (Design 5.1.5)"""

    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: str | None = Field(None, max_length=1000, description="Project description")
    generate_sample_data: bool = Field(False, description="Generate sample data for onboarding")
    organization_id: int | None = Field(None, description="Organization ID this project belongs to")
    usage_mode: str = Field("full", description="Usage mode: 'full' (Live View + Test Lab) or 'test_only' (Test Lab only)")


class ProjectUpdate(BaseModel):
    """Project update schema (Design 5.1.5: usage_mode upgrade)"""

    name: str | None = Field(None, min_length=1, max_length=255, description="Project name")
    description: str | None = Field(None, max_length=1000, description="Project description")
    global_block: bool | None = Field(None, description="Enable global block (panic mode) for this project")
    usage_mode: str | None = Field(None, description="Usage mode: 'full' or 'test_only' (upgrade to Full Mode)")
    diagnostic_config: dict | None = Field(None, description="Diagnostic thresholds for the 12 factors")


class ProjectResponse(BaseModel):
    """Project response schema"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    owner_id: int
    is_active: bool
    role: str | None = None  # user's role in this project
    organization_id: int | None = None  # organization this project belongs to
    usage_mode: str = "full"  # "full" | "test_only" (Design 5.1.5)
    diagnostic_config: dict | None = {}

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
@handle_errors
async def create_project(
    project_data: ProjectCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project_service = Depends(get_project_service),
    audit_service = Depends(get_audit_service)
):
    """Create a new project"""
    logger.info(f"Creating project: {project_data.name}", extra={"user_id": current_user.id})

    # Check project limit
    can_create, error_msg = check_project_limit(
        current_user.id,
        db,
        is_superuser=bool(getattr(current_user, "is_superuser", False)),
    )
    if not can_create:
        limit_status = get_limit_status(db, current_user.id, "projects")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "PROJECT_LIMIT_REACHED",
                "message": error_msg or "You have reached the project limit for your current plan.",
                "details": {
                    "plan_type": limit_status.get("plan_type"),
                    "metric": limit_status.get("metric"),
                    "current": limit_status.get("current"),
                    "limit": limit_status.get("limit"),
                    "remaining": limit_status.get("remaining"),
                    "reset_at": limit_status.get("reset_at"),
                    "upgrade_path": "/settings/billing",
                },
            },
        )

    usage_mode = (project_data.usage_mode or "full").strip().lower()
    if usage_mode not in ("full", "test_only"):
        usage_mode = "full"

    try:
        # Use service to create project (RequestDTO → Domain Model conversion happens here)
        project = project_service.create_project(
            name=project_data.name,
            description=project_data.description,
            owner_id=current_user.id,
            organization_id=project_data.organization_id,
            usage_mode=usage_mode,
        )
        # Transaction is committed by get_db() dependency
    except EntityAlreadyExistsError as e:
        logger.warning(f"Duplicate project name: {project_data.name}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A project with this name already exists.",
        )
    except ValueError as e:
        # Organization access errors
        logger.warning(f"Organization access error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create a project in that organization.",
        )
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Database error creating project: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create project")
    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected error creating project: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create project")

    # Invalidate user's project list cache
    cache_service.invalidate_user_projects_cache(current_user.id)

    # Track analytics event
    analytics_service.track_project_created(
        user_id=current_user.id,
        project_id=project.id,
        project_name=project.name,
    )
    
    # Log activity
    activity_logger.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="project_create",
        action=f"Created project: {project.name}",
        description=f"Created new project '{project.name}'",
        project_id=project.id,
        activity_data={"project_name": project.name, "project_id": project.id},
    )
    
    # Log audit event
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    audit_service.log_action(
        user_id=current_user.id,
        action="project_created",
        resource_type="project",
        resource_id=project.id,
        new_value={"name": project.name, "description": project.description, "organization_id": project.organization_id},
        ip_address=ip_address,
        user_agent=user_agent
    )

    # Sample-data generation is an admin-only bootstrap capability.
    if project_data.generate_sample_data and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sample data generation is available to operators only.",
        )

    if project_data.generate_sample_data and current_user.is_superuser:
        try:
            from app.api.v1.endpoints.admin import generate_sample_data

            # Generate sample data in background (non-blocking)
            # Note: This is a simplified approach. In production, use a background task queue
            import asyncio

            asyncio.create_task(generate_sample_data(project.id, current_user, db))
            logger.info(f"Sample data generation queued for project {project.id}")
        except Exception as e:
            # Don't fail project creation if sample data generation fails
            logger.warning(f"Failed to generate sample data for project {project.id}: {str(e)}")

    logger.info(f"Project created successfully: {project.id}")
    return project


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project_service = Depends(get_project_service),
):
    """List all projects user has access to (owned or member) with optional search"""
    # Try to get from cache
    cache_key = cache_service.project_list_key(current_user.id)
    cached = cache_service.get(cache_key)
    if cached:
        return cached

    # Use service to get projects
    all_projects = project_service.get_projects_for_user(
        user_id=current_user.id,
        search=search
    )

    # Convert to response models
    result = [
        ProjectResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            owner_id=p.owner_id,
            is_active=p.is_active,
            role=get_user_project_role(p.id, current_user.id, db),
            organization_id=p.organization_id,
            usage_mode=getattr(p, "usage_mode", "full") or "full",
            diagnostic_config=getattr(p, "diagnostic_config", {}) or {},
        )
        for p in all_projects
    ]

    # Cache result (5 minutes TTL)
    cache_service.set(cache_key, result, ttl=300)

    return result


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a specific project (any member can view)"""
    project = check_project_access(project_id, current_user, db)
    role = get_user_project_role(project_id, current_user.id, db)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        is_active=project.is_active,
        role=role,
        organization_id=project.organization_id,
        usage_mode=getattr(project, "usage_mode", "full") or "full",
        diagnostic_config=getattr(project, "diagnostic_config", {}) or {},
    )


@router.get("/{project_id}/data-retention-summary")
@handle_errors
async def get_project_data_retention_summary(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get data retention summary for this project (plan-based retention days)."""
    check_project_access(project_id, current_user, db)
    from app.services.data_lifecycle_service import DataLifecycleService
    service = DataLifecycleService(db)
    summary = service.get_data_retention_summary(project_id)
    if "error" in summary:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=summary["error"])
    return summary


@router.patch("/{project_id}", response_model=ProjectResponse)
@handle_errors
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project_service = Depends(get_project_service),
    audit_service = Depends(get_audit_service)
):
    """Update a project (owner/admin only)"""
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])

    logger.info(f"Updating project {project_id}", extra={"updates": project_data.dict(exclude_unset=True)})

    # Check for duplicate name if name is being updated
    if project_data.name and project_data.name != project.name:
        existing = project_service.project_repo.find_by_name_and_owner(project_data.name, project.owner_id)
        if existing and existing.id != project_id:
            logger.warning(f"Duplicate project name: {project_data.name}")
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A project with this name already exists")

    usage_mode = None
    if project_data.usage_mode is not None:
        usage_mode = (project_data.usage_mode or "").strip().lower()
        if usage_mode not in ("full", "test_only"):
            usage_mode = None

    # Use service to update project
    updated_project = project_service.update_project(
        project_id=project_id,
        name=project_data.name,
        description=project_data.description,
        usage_mode=usage_mode if usage_mode else None,
        diagnostic_config=project_data.diagnostic_config,
    )
    
    if not updated_project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    
    project = updated_project

    # Handle Global Block (Panic Mode) integration
    if project_data.global_block is not None:
        # Set project-level panic mode in Redis
        redis_key = f"project:{project_id}:panic_mode"
        if cache_service.enabled:
            cache_service.redis_client.set(redis_key, "1" if project_data.global_block else "0")
        
        # Log activity
        activity_logger.log_activity(
            db=db,
            user_id=current_user.id,
            activity_type="global_block_toggle",
            action=f"Global block {'enabled' if project_data.global_block else 'disabled'}",
            project_id=project_id,
            activity_data={"global_block": project_data.global_block}
        )
        
        logger.info(f"Global block {'enabled' if project_data.global_block else 'disabled'} for project {project_id}")

    # Invalidate cache
    cache_service.invalidate_project_cache(project_id)
    _invalidate_project_list_caches_for_project(db, project_id, project.owner_id)

    # Log activity
    activity_logger.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="project_update",
        action=f"Updated project: {project.name}",
        description=f"Updated project '{project.name}'",
        project_id=project_id,
        activity_data={
            "project_name": project.name,
            "project_id": project_id,
            "changes": project_data.dict(exclude_unset=True),
        },
    )
    
    # Log audit event
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    old_value = {"name": project.name, "description": project.description}
    new_value = project_data.dict(exclude_unset=True)
    audit_service.log_action(
        user_id=current_user.id,
        action="project_updated",
        resource_type="project",
        resource_id=project_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        user_agent=user_agent
    )

    role = get_user_project_role(project_id, current_user.id, db)
    logger.info(f"Project updated successfully: {project_id}")

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        is_active=project.is_active,
        role=role,
        organization_id=project.organization_id,
        usage_mode=getattr(project, "usage_mode", "full") or "full",
        diagnostic_config=getattr(project, "diagnostic_config", {}) or {},
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def delete_project(
    project_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project_service = Depends(get_project_service),
    audit_service = Depends(get_audit_service)
):
    """Delete a project (owner only)"""
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER])

    logger.info(f"Deleting project {project_id}")

    project_name = project.name  # Save name before deletion

    # Use service to delete project (soft delete)
    deleted = project_service.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Log activity
    activity_logger.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="project_delete",
        action=f"Deleted project: {project_name}",
        description=f"Deleted project '{project_name}'",
        project_id=None,
        activity_data={"project_name": project_name, "project_id": project_id},
    )
    
    # Log audit event
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    old_value = {"name": project_name, "project_id": project_id}
    audit_service.log_action(
        user_id=current_user.id,
        action="project_deleted",
        resource_type="project",
        resource_id=project_id,
        old_value=old_value,
        ip_address=ip_address,
        user_agent=user_agent
    )

    # Invalidate cache
    cache_service.invalidate_project_cache(project_id)
    _invalidate_project_list_caches_for_project(db, project_id, project.owner_id)

    logger.info(f"Project deleted successfully: {project_id}")
    return None


class PanicModeUpdate(BaseModel):
    """Panic mode update schema"""
    enabled: bool


class PanicModeResponse(BaseModel):
    """Panic mode response schema"""
    project_id: int
    enabled: bool


# Panic Mode (Global Block) - Emergency kill switch for all API calls in a project
@router.post("/{project_id}/panic", response_model=PanicModeResponse)
@handle_errors
async def toggle_panic_mode(
    project_id: int,
    panic_data: PanicModeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle panic mode for a project (owner/admin only)"""
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])
    
    # 1. Update DB (Persistent State)
    project.is_panic_mode = panic_data.enabled
    
    # 2. Sync to Redis (High Performance Proxy check - for fast lookups)
    redis_key = f"project:{project_id}:panic_mode"
    if cache_service.enabled:
        # Set "1" for enabled, "0" for disabled
        cache_service.redis_client.set(redis_key, "1" if panic_data.enabled else "0")
    
    # 3. Log activity
    activity_logger.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="panic_toggle",
        action=f"Panic mode {'enabled' if panic_data.enabled else 'disabled'}",
        project_id=project_id,
        activity_data={"enabled": panic_data.enabled}
    )
    
    logger.info(f"Panic mode {'enabled' if panic_data.enabled else 'disabled'} for project {project_id}")
    return PanicModeResponse(project_id=project_id, enabled=panic_data.enabled)


# Panic Mode (Global Block) - Get current status
@router.get("/{project_id}/panic", response_model=PanicModeResponse)
@handle_errors
async def get_panic_mode(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current panic mode status for a project"""
    project = check_project_access(project_id, current_user, db)
    # Return from DB (also synced to Redis for high-performance proxy checks)
    return PanicModeResponse(project_id=project_id, enabled=project.is_panic_mode)


    # Evaluation Rubrics
from app.models.evaluation_rubric import EvaluationRubric

class RubricCreate(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    criteria_prompt: str
    min_score: int = 1
    max_score: int = 5

class RubricResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    criteria_prompt: str
    min_score: int
    max_score: int
    is_active: bool

@router.post("/{project_id}/rubrics", response_model=RubricResponse)
@handle_errors
async def create_rubric(
    project_id: int,
    data: RubricCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    rubric_repo: EvaluationRubricRepository = Depends(get_evaluation_rubric_repository)
):
    """Create a new evaluation rubric for LLM-as-a-Judge"""
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])
    
    rubric = EvaluationRubric(
        project_id=project_id,
        name=data.name,
        description=data.description,
        criteria_prompt=data.criteria_prompt,
        min_score=data.min_score,
        max_score=data.max_score
    )
    # Use repository to save (transaction managed by get_db())
    return rubric_repo.save(rubric)

@router.get("/{project_id}/rubrics", response_model=List[RubricResponse])
@handle_errors
async def list_rubrics(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    rubric_repo: EvaluationRubricRepository = Depends(get_evaluation_rubric_repository)
):
    """List all evaluation rubrics for a project"""
    check_project_access(project_id, current_user, db)
    return rubric_repo.find_by_project_id(project_id, active_only=False)


class ProjectPatch(BaseModel):
    """Schema for applying a configuration patch from Test Lab"""
    nodes: List[dict] = Field(..., description="List of nodes in the patched configuration")
    edges: List[dict] = Field(..., description="List of edges in the patched configuration")
    version: str | None = Field(None, description="Optional version name for the patch")


@router.post("/{project_id}/apply-patch", response_model=ProjectResponse)
@handle_errors
async def apply_project_patch(
    project_id: int,
    patch_data: ProjectPatch,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project_service = Depends(get_project_service),
    audit_service = Depends(get_audit_service)
):
    """Apply a configuration patch from Test Lab to a Live project (Design 5.1.5: Audit Loop Closure)"""
    # owner/admin access required to push patches to production
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])
    
    logger.info(f"Applying patch to project {project_id}", extra={"nodes_count": len(patch_data.nodes)})
    
    # Log activity
    activity_logger.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="project_patch",
        action=f"Applied safety patch to project {project_id}",
        description=f"Applied configuration patch featuring {len(patch_data.nodes)} nodes from Test Lab",
        project_id=project_id,
        activity_data={"nodes": len(patch_data.nodes), "edges": len(patch_data.edges), "version": patch_data.version}
    )
    
    # Log audit event
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    audit_service.log_action(
        user_id=current_user.id,
        action="project_patched",
        resource_type="project",
        resource_id=project_id,
        new_value={"patch_version": patch_data.version, "nodes_count": len(patch_data.nodes)},
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    # Persist the patch to the project record (Official Live Configuration)
    project.canvas_nodes = patch_data.nodes
    project.canvas_edges = patch_data.edges
    db.commit()
    db.refresh(project)
    if cache_service.enabled:
        cache_service.delete(f"project:{project_id}:live_view_hot_project_ref")
    invalidate_agent_visibility_cache(project_id)
    publish_agents_changed(project_id, force_refresh=True)
    
    role = get_user_project_role(project_id, current_user.id, db)
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        is_active=project.is_active,
        role=role,
        organization_id=project.organization_id,
        usage_mode=getattr(project, "usage_mode", "full") or "full",
    )


@router.post("/{project_id}/behavior-datasets/{dataset_id}/delete")
async def delete_behavior_dataset(
    project_id: int,
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a validation dataset by ID. Exposed under projects for reliable routing."""
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])
    ds = (
        db.query(ValidationDataset)
        .filter(
            ValidationDataset.project_id == project_id,
            ValidationDataset.id == dataset_id,
        )
        .first()
    )
    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Validation dataset not found",
        )
    db.delete(ds)
    db.commit()
    return {"ok": True}
