"""
Middleware for enforcing subscription usage limits
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.subscription_service import SubscriptionService


async def usage_enforcement_middleware(request: Request, call_next):
    """
    Middleware to check usage limits before processing requests
    This should be applied to specific routes that need limit checking
    """
    # Skip middleware for certain paths
    skip_paths = ["/docs", "/openapi.json", "/redoc", "/health", "/webhooks"]
    if any(request.url.path.startswith(path) for path in skip_paths):
        return await call_next(request)

    # Get user from request (if authenticated)
    # This assumes you have a way to get current user from request
    # For now, we'll skip enforcement in middleware and do it in endpoints

    # TODO: Implement actual usage checking here if needed
    # For now, usage checking is done at the endpoint level

    response = await call_next(request)
    return response


def check_project_limit(user_id: int, db: Session) -> tuple[bool, str | None]:
    """Check if user can create a new project"""
    service = SubscriptionService(db)
    plan_info = service.get_user_plan(user_id)
    limits = plan_info["limits"]
    project_limit = limits.get("projects", 1)

    if project_limit == -1:  # unlimited
        return (True, None)

    # Count user's projects
    from app.models.project import Project

    project_count = db.query(Project).filter(Project.owner_id == user_id).count()

    if project_count >= project_limit:
        return (False, f"Project limit reached: {project_count} / {project_limit}")

    return (True, None)


def check_team_member_limit(user_id: int, project_id: int, db: Session) -> tuple[bool, str | None]:
    """Check if user can add a team member to a project"""
    service = SubscriptionService(db)
    plan_info = service.get_user_plan(user_id)
    limits = plan_info["limits"]
    member_limit = limits.get("team_members_per_project", 1)

    if member_limit == -1:  # unlimited
        return (True, None)

    # Count project members (excluding owner)
    from app.models.project import Project
    from app.models.project_member import ProjectMember

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return (False, "Project not found")

    # Count members (excluding owner)
    member_count = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).count()

    if member_count >= member_limit:
        return (False, f"Team member limit reached: {member_count} / {member_limit}")

    return (True, None)


def check_api_call_limit(user_id: int, db: Session) -> tuple[bool, str | None]:
    """Check if user can make an API call"""
    service = SubscriptionService(db)
    return service.check_usage_limit(user_id, "api_calls", 1)
