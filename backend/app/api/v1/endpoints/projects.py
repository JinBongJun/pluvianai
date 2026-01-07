"""
Project endpoints
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole, get_user_project_role
from app.core.logging_config import logger
from app.services.cache_service import cache_service
from app.middleware.usage_middleware import check_project_limit
from app.services.activity_logger import activity_logger
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember

router = APIRouter()


class ProjectCreate(BaseModel):
    """Project creation schema"""
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: str | None = Field(None, max_length=1000, description="Project description")


class ProjectUpdate(BaseModel):
    """Project update schema"""
    name: str | None = Field(None, min_length=1, max_length=255, description="Project name")
    description: str | None = Field(None, max_length=1000, description="Project description")


class ProjectResponse(BaseModel):
    """Project response schema"""
    id: int
    name: str
    description: str | None
    owner_id: int
    is_active: bool
    role: str | None = None  # user's role in this project
    
    class Config:
        from_attributes = True


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new project"""
    logger.info(f"Creating project: {project_data.name}", extra={"user_id": current_user.id})
    
    # Check project limit
    can_create, error_msg = check_project_limit(current_user.id, db)
    if not can_create:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_msg or "Project limit reached. Please upgrade your plan."
        )
    
    # Check for duplicate project name (same owner)
    existing = db.query(Project).filter(
        Project.name == project_data.name,
        Project.owner_id == current_user.id,
        Project.is_active == True
    ).first()
    
    if existing:
        logger.warning(f"Duplicate project name: {project_data.name}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A project with this name already exists"
        )
    
    try:
        project = Project(
            name=project_data.name,
            description=project_data.description,
            owner_id=current_user.id,
            is_active=True
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # Invalidate user's project list cache
        cache_service.invalidate_user_projects_cache(current_user.id)
        
        # Log activity
        activity_logger.log_activity(
            db=db,
            user_id=current_user.id,
            activity_type="project_create",
            action=f"Created project: {project.name}",
            description=f"Created new project '{project.name}'",
            project_id=project.id,
            activity_data={"project_name": project.name, "project_id": project.id}
        )
        
        logger.info(f"Project created successfully: {project.id}")
        return project
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Database error creating project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected error creating project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project"
        )


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all projects user has access to (owned or member) with optional search"""
    # Try to get from cache
    cache_key = cache_service.project_list_key(current_user.id)
    cached = cache_service.get(cache_key)
    if cached:
        return cached
    
    # Build base query for owned projects
    owned_query = db.query(Project).filter(
        Project.owner_id == current_user.id,
        Project.is_active == True
    )
    
    # Build base query for member projects
    member_query = db.query(Project).join(ProjectMember).filter(
        ProjectMember.user_id == current_user.id,
        Project.is_active == True
    )
    
    # Apply search filter if provided
    if search:
        search_filter = or_(
            Project.name.ilike(f"%{search}%"),
            Project.description.ilike(f"%{search}%")
        )
        owned_query = owned_query.filter(search_filter)
        member_query = member_query.filter(search_filter)
    
    # Get projects
    owned_projects = owned_query.all()
    member_projects = member_query.all()
    
    # Combine and remove duplicates
    all_projects_dict = {p.id: p for p in owned_projects + member_projects}
    all_projects = list(all_projects_dict.values())
    
    # Convert to response models
    result = [
        ProjectResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            owner_id=p.owner_id,
            is_active=p.is_active,
            role=get_user_project_role(p.id, current_user.id, db)
        )
        for p in all_projects
    ]
    
    # Cache result (5 minutes TTL)
    cache_service.set(cache_key, result, ttl=300)
    
    return result


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific project (any member can view)"""
    project = check_project_access(project_id, current_user, db)
    role = get_user_project_role(project_id, current_user.id, db)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        is_active=project.is_active,
        role=role
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a project (owner/admin only)"""
    project = check_project_access(
        project_id, current_user, db,
        required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN]
    )
    
    logger.info(f"Updating project {project_id}", extra={"updates": project_data.dict(exclude_unset=True)})
    
    # Check for duplicate name if name is being updated
    if project_data.name and project_data.name != project.name:
        existing = db.query(Project).filter(
            Project.name == project_data.name,
            Project.owner_id == project.owner_id,
            Project.is_active == True,
            Project.id != project_id
        ).first()
        
        if existing:
            logger.warning(f"Duplicate project name: {project_data.name}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A project with this name already exists"
            )
    
    # Update fields
    if project_data.name is not None:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    
    try:
        db.commit()
        db.refresh(project)
        
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
            activity_data={"project_name": project.name, "project_id": project_id, "changes": project_data.dict(exclude_unset=True)}
        )
        
        role = get_user_project_role(project_id, current_user.id, db)
        logger.info(f"Project updated successfully: {project_id}")
        
        return ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            owner_id=project.owner_id,
            is_active=project.is_active,
            role=role
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update project"
        )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a project (owner only)"""
    project = check_project_access(
        project_id, current_user, db,
        required_roles=[ProjectRole.OWNER]
    )
    
    logger.info(f"Deleting project {project_id}")
    
    project_name = project.name  # Save name before deletion
    
    try:
        db.delete(project)
        db.commit()
        
        # Log activity
        activity_logger.log_activity(
            db=db,
            user_id=current_user.id,
            activity_type="project_delete",
            action=f"Deleted project: {project_name}",
            description=f"Deleted project '{project_name}'",
            project_id=None,  # Project is deleted, so no project_id
            activity_data={"project_name": project_name, "project_id": project_id}
        )
        
        # Invalidate cache
        cache_service.invalidate_project_cache(project_id)
        cache_service.invalidate_user_projects_cache(current_user.id)
        
        logger.info(f"Project deleted successfully: {project_id}")
        return None
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete project"
        )



