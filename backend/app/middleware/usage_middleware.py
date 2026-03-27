"""
Middleware for enforcing subscription usage limits
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.subscription_limits import PLAN_LIMITS, normalize_plan_type
from app.services.subscription_service import SubscriptionService
from app.services.billing_service import BillingService
from app.core.logging_config import logger


async def usage_enforcement_middleware(request: Request, call_next):
    """
    Middleware to check usage limits before processing requests
    This should be applied to specific routes that need limit checking
    """
    # Skip middleware for certain paths
    skip_paths = ["/docs", "/openapi.json", "/redoc", "/health", "/webhooks", "/billing/webhook"]
    if any(request.url.path.startswith(path) for path in skip_paths):
        return await call_next(request)

    # Usage checking is done at the endpoint level for better control
    # See: billing_service.py, subscription_service.py for usage tracking

    response = await call_next(request)
    return response


def check_project_limit(user_id: int, db: Session, is_superuser: bool = False) -> tuple[bool, str | None]:
    """Check if user can create a new project"""
    if is_superuser:
        return (True, None)

    service = SubscriptionService(db)
    plan_info = service.get_user_plan(user_id)
    limits = plan_info["limits"]
    project_limit = limits.get("projects", 1)

    if project_limit == -1:  # unlimited
        return (True, None)

    # Count user's projects
    from app.models.project import Project

    project_count = db.query(Project).filter(
        Project.owner_id == user_id,
        Project.is_active.is_(True),
        Project.is_deleted.is_(False),
    ).count()

    if project_count >= project_limit:
        return (False, f"Project limit reached: {project_count} / {project_limit}")

    return (True, None)


def check_organization_limit(user_id: int, db: Session, is_superuser: bool = False) -> tuple[bool, str | None]:
    """Check if user can create a new organization."""
    if is_superuser:
        return (True, None)

    service = SubscriptionService(db)
    plan_info = service.get_user_plan(user_id)
    limits = plan_info["limits"]
    # Never silently downgrade paid users to free cap when a limits payload key is missing.
    plan_type = normalize_plan_type(plan_info.get("plan_type"))
    default_org_limit = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"]).get("organizations", 1)
    org_limit = limits.get("organizations", default_org_limit)

    if org_limit == -1:  # unlimited
        return (True, None)

    from app.models.organization import Organization

    org_count = db.query(Organization).filter(
        Organization.owner_id == user_id,
        Organization.is_deleted.is_(False),
    ).count()
    if org_count >= org_limit:
        return (False, f"Organization limit reached: {org_count} / {org_limit}")
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
    billing_service = BillingService(db)
    # Increment usage and check soft cap
    is_allowed, warning = billing_service.increment_usage(user_id, "api_calls", 1)
    return (is_allowed, warning)
