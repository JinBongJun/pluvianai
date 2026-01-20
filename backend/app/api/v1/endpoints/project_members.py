"""
Project member management endpoints
"""

from typing import List
from enum import Enum
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.services.cache_service import cache_service
from app.middleware.usage_middleware import check_team_member_limit
from app.services.activity_logger import activity_logger
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember

router = APIRouter()


class MemberRole(str, Enum):
    """Member role enum"""

    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class ProjectMemberCreate(BaseModel):
    """Project member creation schema"""

    user_email: EmailStr = Field(..., description="User email address")
    role: MemberRole = Field(..., description="Member role (admin, member, viewer)")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in [MemberRole.ADMIN, MemberRole.MEMBER, MemberRole.VIEWER]:
            raise ValueError("Role must be one of: admin, member, viewer")
        return v


class ProjectMemberUpdate(BaseModel):
    """Project member update schema"""

    role: MemberRole = Field(..., description="Member role (admin, member, viewer)")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in [MemberRole.ADMIN, MemberRole.MEMBER, MemberRole.VIEWER]:
            raise ValueError("Role must be one of: admin, member, viewer")
        return v


class ProjectMemberResponse(BaseModel):
    """Project member response schema"""

    id: int
    project_id: int
    user_id: int
    user_email: str
    user_name: str | None
    role: str
    created_at: str

    class Config:
        from_attributes = True


@router.post(
    "/projects/{project_id}/members", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED
)
@handle_errors
async def add_project_member(
    project_id: int,
    member_data: ProjectMemberCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a member to project (owner/admin only)"""
    logger.info(
        f"Adding member to project {project_id}",
        extra={"project_id": project_id, "user_email": member_data.user_email, "role": member_data.role},
    )

    # Check access (owner or admin only)
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])

    # Find user by email
    user = db.query(User).filter(User.email == member_data.user_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with email '{member_data.user_email}' not found. The user must have an existing AgentGuard account with this email address.",
        )

    # Check if user is already owner
    if project.owner_id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already the project owner")

    # Check team member limit
    can_add, error_msg = check_team_member_limit(current_user.id, project_id, db)
    if not can_add:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_msg or "Team member limit reached. Please upgrade your plan.",
        )

    # Check if user is already a member
    existing = (
        db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id).first()
    )

    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member of this project")

    # Create member
    member = ProjectMember(project_id=project_id, user_id=user.id, role=member_data.role.value)
    db.add(member)
    db.commit()
    db.refresh(member)

    # Invalidate cache
    cache_service.invalidate_project_cache(project_id)
    cache_service.invalidate_user_projects_cache(user.id)
    cache_service.invalidate_user_projects_cache(current_user.id)

    # Log activity
    activity_logger.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="member_add",
        action=f"Added member: {user.email}",
        description=f"Added {user.email} as {member_data.role} to project",
        project_id=project_id,
        activity_data={"member_email": user.email, "role": member_data.role.value, "project_id": project_id},
    )

    logger.info(f"Member added successfully: {user.email} to project {project_id}")

    # Return response with user info
    return ProjectMemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        user_email=user.email,
        user_name=user.full_name,
        role=member.role,
        created_at=member.created_at.isoformat(),
    )


@router.get("/projects/{project_id}/members", response_model=List[ProjectMemberResponse])
@handle_errors
async def list_project_members(
    project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """List all members of a project (all members can view)"""
    # Check access (any member can view)
    project = check_project_access(project_id, current_user, db)

    # Try to get from cache
    cache_key = cache_service.project_members_key(project_id)
    cached = cache_service.get(cache_key)
    if cached:
        return cached

    # Get all members with eager loading (N+1 문제 해결)
    members = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.project_id == project_id)
        .all()
    )

    # Get owner info with eager loading
    owner = db.query(User).filter(User.id == project.owner_id).first()

    # Build response
    result = []

    # Add owner
    if owner:
        result.append(
            ProjectMemberResponse(
                id=0,  # Owner doesn't have ProjectMember ID
                project_id=project_id,
                user_id=owner.id,
                user_email=owner.email,
                user_name=owner.full_name,
                role=ProjectRole.OWNER,
                created_at=project.created_at.isoformat(),
            )
        )

    # Add members (user already loaded)
    for member in members:
        if member.user:
            result.append(
                ProjectMemberResponse(
                    id=member.id,
                    project_id=member.project_id,
                    user_id=member.user_id,
                    user_email=member.user.email,
                    user_name=member.user.full_name,
                    role=member.role,
                    created_at=member.created_at.isoformat(),
                )
            )

    # Cache result (5 minutes TTL)
    cache_service.set(cache_key, result, ttl=300)

    return result


@router.patch("/projects/{project_id}/members/{user_id}", response_model=ProjectMemberResponse)
@handle_errors
async def update_project_member_role(
    project_id: int,
    user_id: int,
    member_data: ProjectMemberUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a member's role (owner/admin only)"""
    logger.info(
        f"Updating member role in project {project_id}",
        extra={"project_id": project_id, "user_id": user_id, "new_role": member_data.role},
    )

    # Check access (owner or admin only)
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])

    # Check if trying to change owner
    if project.owner_id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change owner role")

    # Find member
    member = (
        db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id).first()
    )

    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Update role
    member.role = member_data.role.value
    db.commit()
    db.refresh(member)

    # Invalidate cache
    cache_service.invalidate_project_cache(project_id)

    # Get user info for logging
    user = db.query(User).filter(User.id == user_id).first()

    # Log activity
    activity_logger.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="member_update",
        action=f"Updated member role: {user.email if user else user_id}",
        description=f"Changed role to {member_data.role.value}",
        project_id=project_id,
        activity_data={"member_user_id": user_id, "new_role": member_data.role.value, "project_id": project_id},
    )

    logger.info(f"Member role updated successfully: user {user_id} in project {project_id}")

    return ProjectMemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        user_email=user.email if user else "",
        user_name=user.full_name if user else None,
        role=member.role,
        created_at=member.created_at.isoformat(),
    )


@router.delete("/projects/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    project_id: int, user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Remove a member from project (owner/admin only)"""
    # Check access (owner or admin only)
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])

    # Check if trying to remove owner
    if project.owner_id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove project owner")

    # Find and remove member
    member = (
        db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id).first()
    )

    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Get user info before deletion
    user = db.query(User).filter(User.id == user_id).first()

    db.delete(member)
    db.commit()

    # Log activity
    activity_logger.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="member_remove",
        action=f"Removed member: {user.email if user else user_id}",
        description="Removed member from project",
        project_id=project_id,
        activity_data={
            "member_user_id": user_id,
            "member_email": user.email if user else None,
            "project_id": project_id,
        },
    )

    # Invalidate cache
    cache_service.invalidate_project_cache(project_id)
    cache_service.invalidate_user_projects_cache(user_id)
    cache_service.invalidate_user_projects_cache(current_user.id)

    logger.info(f"Member removed successfully: user {user_id} from project {project_id}")
    return None
