"""
Permission utilities for project access control
"""

from enum import Enum
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember


class ProjectRole(str, Enum):
    """Project role types"""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


def get_user_project_role(project_id: int, user_id: int, db: Session) -> Optional[str]:
    """
    Get user's role in a project

    Args:
        project_id: Project ID
        user_id: User ID
        db: Database session

    Returns:
        Role string (owner, admin, member, viewer) or None
    """
    # Check if user is project owner
    project = db.query(Project).filter(Project.id == project_id).first()
    if project and project.owner_id == user_id:
        return ProjectRole.OWNER

    # Check ProjectMember
    member = (
        db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id).first()
    )

    return member.role if member else None


def check_project_access(
    project_id: int, user: User, db: Session, required_roles: Optional[List[str]] = None
) -> Project:
    """
    Check if user has access to project

    Args:
        project_id: Project ID
        user: Current user
        db: Database session
        required_roles: Optional list of required roles

    Returns:
        Project object

    Raises:
        HTTPException: If access is denied
    """
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Check if user is owner
    if project.owner_id == user.id:
        return project

    # Check if user is a member
    member = (
        db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id).first()
    )

    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this project")

    # Check role permissions if required
    if required_roles:
        if member.role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join(required_roles)}. Your role: {member.role}",
            )

    return project


def get_project_with_access(project_id: int, required_roles: Optional[List[str]] = None):
    """
    Dependency function to get project with access check

    Usage:
        @router.get("/projects/{project_id}/...")
        async def endpoint(
            project: Project = Depends(get_project_with_access(required_roles=['owner', 'admin']))
        ):
            ...
    """

    async def _get_project(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Project:
        return check_project_access(project_id, current_user, db, required_roles)

    return _get_project


def require_admin(user: User) -> None:
    """
    Require admin access (superuser)
    
    Args:
        user: Current user
        
    Raises:
        HTTPException: If user is not admin
    """
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
