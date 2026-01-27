"""
Project endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole, get_user_project_role
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.dependencies import get_project_service, get_evaluation_rubric_repository, get_audit_service
from app.infrastructure.repositories.evaluation_rubric_repository import EvaluationRubricRepository
from app.services.cache_service import cache_service
from app.services.firewall_service import firewall_service
from app.middleware.usage_middleware import check_project_limit
from app.services.activity_logger import activity_logger
from app.core.analytics import analytics_service
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError

# Repository 패턴 사용 예시 (주석으로 추가)
# from app.core.dependencies import get_project_repository
# from app.infrastructure.repositories.project_repository import ProjectRepository

router = APIRouter()


class ProjectCreate(BaseModel):
    """Project creation schema"""

    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: str | None = Field(None, max_length=1000, description="Project description")
    generate_sample_data: bool = Field(False, description="Generate sample data for onboarding")
    organization_id: int | None = Field(None, description="Organization ID this project belongs to")


class ProjectUpdate(BaseModel):
    """Project update schema"""

    name: str | None = Field(None, min_length=1, max_length=255, description="Project name")
    description: str | None = Field(None, max_length=1000, description="Project description")
    global_block: bool | None = Field(None, description="Enable global block (panic mode) for this project")


class ProjectResponse(BaseModel):
    """Project response schema"""

    id: int
    name: str
    description: str | None
    owner_id: int
    is_active: bool
    role: str | None = None  # user's role in this project
    organization_id: int | None = None  # organization this project belongs to

    class Config:
        from_attributes = True


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
    can_create, error_msg = check_project_limit(current_user.id, db)
    if not can_create:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_msg or "Project limit reached. Please upgrade your plan.",
        )

    try:
        # Use service to create project (RequestDTO → Domain Model conversion happens here)
        project = project_service.create_project(
            name=project_data.name,
            description=project_data.description,
            owner_id=current_user.id,
            organization_id=project_data.organization_id
        )
        # Transaction is committed by get_db() dependency
    except EntityAlreadyExistsError as e:
        logger.warning(f"Duplicate project name: {project_data.name}")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        # Organization access errors
        logger.warning(f"Organization access error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

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

        # Generate sample data if requested (for onboarding)
        if project_data.generate_sample_data:
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
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Database error creating project: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create project")
    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected error creating project: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create project")


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
    )


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

    # Use service to update project
    updated_project = project_service.update_project(
        project_id=project_id,
        name=project_data.name,
        description=project_data.description
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
    cache_service.invalidate_user_projects_cache(current_user.id)

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
    cache_service.invalidate_user_projects_cache(current_user.id)

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
    id: int
    name: str
    description: Optional[str]
    criteria_prompt: str
    min_score: int
    max_score: int
    is_active: bool

    class Config:
        from_attributes = True

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
