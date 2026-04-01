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
from app.models.organization import Organization, OrganizationMember


class ProjectRole(str, Enum):
    """Project role types"""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


def get_user_organization_role(
    organization_id: Optional[int],
    user_id: int,
    db: Session,
) -> Optional[str]:
    """Get a user's role in an organization if one exists."""
    if not organization_id:
        return None

    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization or organization.is_deleted:
        return None
    if organization.owner_id == user_id:
        return ProjectRole.OWNER.value

    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    return str(membership.role) if membership else None


def get_project_access_context(project: Project, user_id: int, db: Session) -> dict:
    """
    Describe how a user can currently see/access a project.

    - `owned`: project owner
    - `project_member`: direct project membership
    - `organization_member`: visible through org membership only (no project membership)
    """
    project_role = get_user_project_role(project.id, user_id, db)
    org_role = get_user_organization_role(getattr(project, "organization_id", None), user_id, db)
    created_by_me = project.owner_id == user_id

    if created_by_me:
        access_source = "owned"
        has_project_access = True
    elif project_role:
        access_source = "project_member"
        has_project_access = True
    elif org_role:
        access_source = "organization_member"
        has_project_access = False
    else:
        access_source = None
        has_project_access = False

    return {
        "role": str(project_role) if project_role else None,
        "org_role": str(org_role) if org_role else None,
        "access_source": access_source,
        "created_by_me": created_by_me,
        "has_project_access": has_project_access,
        "entitlement_scope": "account",
    }


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
    if project and project.is_active and (not project.is_deleted) and project.owner_id == user_id:
        return ProjectRole.OWNER.value

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
    if not project.is_active or project.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    access_context = get_project_access_context(project, user.id, db)

    # Check if user is owner
    if project.owner_id == user.id:
        return project

    # Check if user is a member
    member = (
        db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id).first()
    )

    if not member:
        if access_context.get("access_source") == "organization_member":
            message = (
                "This project is visible because you belong to the organization, "
                "but you have not been added to the project itself. "
                "Ask a project owner or admin to grant project access."
            )
        else:
            message = "You don't have access to this project"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "PROJECT_ACCESS_DENIED",
                "message": message,
                "details": {
                    "reason": "not_project_member",
                    "project_id": project_id,
                    "current_role": None,
                    "required_roles": sorted(set(required_roles or [])),
                    **access_context,
                },
            },
        )

    # Check role permissions if required
    if required_roles:
        if member.role not in required_roles:
            required_roles_text = ", ".join(sorted(set(required_roles)))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "PROJECT_ROLE_INSUFFICIENT",
                    "message": (
                        f"This action requires one of: {required_roles_text}. "
                        f"Your role is '{member.role}'. "
                        "Ask a project owner or admin to update your role if needed."
                    ),
                    "details": {
                        "reason": "insufficient_role",
                        "project_id": project_id,
                        "current_role": str(member.role),
                        "required_roles": sorted(set(required_roles)),
                        **access_context,
                    },
                },
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


def get_current_superuser(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: authenticated user must be a superuser (ops/admin)."""
    require_admin(current_user)
    return current_user


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
