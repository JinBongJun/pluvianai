"""
Organization endpoints for org-first architecture.
"""

from typing import List, Optional
from datetime import datetime, timedelta, timezone
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.logging_config import logger
from app.core.decorators import handle_errors
from app.core.permissions import get_project_access_context
from app.core.dependencies import get_organization_service, get_project_service, get_user_service
from app.middleware.usage_middleware import check_organization_limit
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError
from app.models.user import User
from app.models.organization import Organization, OrganizationMember
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.api_call import APICall
from app.models.alert import Alert
from app.models.quality_score import QualityScore
from app.services.cost_analyzer import CostAnalyzer
from app.services.cache_service import cache_service
from app.services.subscription_service import SubscriptionService
from app.core.subscription_limits import PLAN_LIMITS, normalize_plan_type
from app.core.usage_limits import get_limit_status


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _owner_usage_limit_caps(db: Session, org: Organization) -> tuple[int, float]:
    """
    Display caps for org stats (7d calls vs monthly plan ceiling).
    Uses the org owner's subscription plan, not Organization.plan_type.
    """
    plan_info = SubscriptionService(db).get_user_plan(int(org.owner_id))
    pt = normalize_plan_type(plan_info.get("plan_type"))
    pl = PLAN_LIMITS.get(pt, PLAN_LIMITS["free"])
    calls_cap = pl.get("api_calls_per_month", 0)
    if calls_cap == -1:
        calls_limit = 1_000_000
    else:
        calls_limit = int(calls_cap)
    # Cost is informational only (no hard cap in PLAN_LIMITS); scale with tier for UI.
    cost_limit = max(10.0, float(calls_limit) / 100.0) if calls_limit < 1_000_000 else 1_000_000.0
    return calls_limit, cost_limit


router = APIRouter()
cost_analyzer = CostAnalyzer()


def _invalidate_project_list_caches_for_org(db: Session, org: Organization) -> None:
    user_ids = {int(org.owner_id)}

    org_member_rows = (
        db.query(OrganizationMember.user_id)
        .filter(OrganizationMember.organization_id == org.id)
        .all()
    )
    for row in org_member_rows:
        if getattr(row, "user_id", None):
            user_ids.add(int(row.user_id))

    project_rows = (
        db.query(Project.id, Project.owner_id)
        .filter(Project.organization_id == org.id)
        .all()
    )
    project_ids = []
    for row in project_rows:
        if getattr(row, "id", None):
            project_ids.append(int(row.id))
        if getattr(row, "owner_id", None):
            user_ids.add(int(row.owner_id))

    if project_ids:
        project_member_rows = (
            db.query(ProjectMember.user_id)
            .filter(ProjectMember.project_id.in_(project_ids))
            .all()
        )
        for row in project_member_rows:
            if getattr(row, "user_id", None):
                user_ids.add(int(row.user_id))

    for project_id in project_ids:
        cache_service.invalidate_project_cache(project_id)

    for user_id in user_ids:
        cache_service.invalidate_user_projects_cache(user_id)


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    # Public plans: free, starter, pro, enterprise (billing is account-level; org stores label)
    plan_type: str = Field("free", pattern="^(free|starter|pro|enterprise)$")


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)


class OrganizationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    plan_type: str
    projects_count: int
    calls_7d: int
    cost_7d: float
    alerts_open: int
    drift_projects: int
    current_user_role: Optional[str] = None
    membership_source: Optional[str] = None

class OrganizationUsage(BaseModel):
    calls: int = 0
    calls_limit: int = 0
    cost: float = 0.0
    cost_limit: float = 0.0
    quality: float = 0.0


class OrganizationAlert(BaseModel):
    project: Optional[str] = None
    summary: Optional[str] = None
    severity: Optional[str] = None


class OrganizationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    type: Optional[str] = None  # Deprecated: use plan_type. Kept for backward compatibility.
    plan_type: str
    stats: Optional[dict] = None  # For backward compatibility
    current_user_role: Optional[str] = None
    membership_source: Optional[str] = None

class OrgProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    calls_24h: int
    cost_7d: float
    quality: Optional[float]
    alerts_open: int
    drift: bool
    role: Optional[str] = None
    org_role: Optional[str] = None
    access_source: Optional[str] = None
    created_by_me: Optional[bool] = None
    has_project_access: Optional[bool] = None
    owner_name: Optional[str] = None
    entitlement_scope: Optional[str] = None

class OrganizationMemberRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class OrganizationMemberCreate(BaseModel):
    email: EmailStr
    role: OrganizationMemberRole = Field(..., description="Member role (admin, member, viewer)")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in [
            OrganizationMemberRole.ADMIN,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.VIEWER,
        ]:
            raise ValueError("Role must be one of: admin, member, viewer")
        return v


class OrganizationMemberResponse(BaseModel):
    id: int
    user_id: int
    email: str
    full_name: Optional[str] = None
    role: str
    joined_at: str


def _get_org_role(db: Session, org_id: int, current_user: User, org: Optional[Organization] = None) -> Optional[str]:
    if org and org.owner_id == current_user.id:
        return OrganizationMemberRole.OWNER.value

    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        return None
    return str(membership.role)


def _get_org_membership_source(current_user: User, org: Organization) -> str:
    return "owned" if org.owner_id == current_user.id else "invited"


def _require_org_access(
    db: Session,
    org_id: int,
    current_user: User,
    org_service,
    required_roles: Optional[List[str]] = None,
) -> tuple[Organization, str]:
    org = org_service.get_organization_by_id(org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    current_role = _get_org_role(db, org_id, current_user, org)
    if not current_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this organization",
        )

    if required_roles and current_role not in required_roles:
        required_label = " or ".join(required_roles)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This action requires organization {required_label} role. "
                f"Current role: {current_role}. "
                "Ask the organization owner to update your role if needed."
            ),
        )

    return org, current_role


def _get_user_orgs(org_service, user: User) -> List[Organization]:
    """
    Get organizations where user is owner or member.
    Uses OrganizationService to get all orgs for user.
    """
    return org_service.get_organizations_by_user_id(user.id)


@router.post("", response_model=OrganizationDetail, status_code=status.HTTP_201_CREATED)
@handle_errors
def create_organization(
    org_data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
):
    """Create a new organization for the current user."""
    name = org_data.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization name is required",
        )

    can_create, error_msg = check_organization_limit(
        current_user.id,
        db,
        is_superuser=bool(getattr(current_user, "is_superuser", False)),
    )
    if not can_create:
        limit_status = get_limit_status(db, current_user.id, "organizations")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ORG_LIMIT_REACHED",
                "message": error_msg or "You have reached the organization limit for your current plan.",
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

    try:
        org = org_service.create_organization(
            name=name,
            owner_id=current_user.id,
            description=org_data.description,
            plan_type=org_data.plan_type or "free"
        )
        # Transaction is committed by get_db() dependency
        return org
    except EntityAlreadyExistsError as e:
        logger.warning("Organization create rejected: already exists", extra={"reason": str(e)})
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organization with this name already exists.",
        )


@router.get("", response_model=List[OrganizationSummary])
def list_organizations(
    include_stats: bool = Query(True, description="Include basic usage stats"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
):
    """List organizations for the current user with optional stats."""
    orgs = _get_user_orgs(org_service, current_user)
    account_plan_type = str(SubscriptionService(db).get_user_plan(current_user.id).get("plan_type") or "free")

    if not orgs:
        return []

    org_ids = [o.id for o in orgs]

    # Base projects count per org (active projects only)
    projects_counts = dict(
        db.query(Project.organization_id, func.count(Project.id))
        .filter(
            Project.organization_id.in_(org_ids),
            Project.is_active.is_(True),
            Project.is_deleted.is_(False),
        )
        .group_by(Project.organization_id)
        .all()
    )

    # Defaults when stats disabled
    calls_map = {oid: 0 for oid in org_ids}
    cost_map = {oid: 0.0 for oid in org_ids}
    alerts_map = {oid: 0 for oid in org_ids}
    drift_map = {oid: 0 for oid in org_ids}

    if include_stats:
        # Collect project ids per org
        proj_rows = (
            db.query(Project.id, Project.organization_id)
            .filter(
                Project.organization_id.in_(org_ids),
                Project.is_active.is_(True),
                Project.is_deleted.is_(False),
            )
            .all()
        )
        org_to_project_ids = {}
        for pid, oid in proj_rows:
            org_to_project_ids.setdefault(oid, []).append(pid)

        now = _utcnow_naive()
        seven_days_ago = now - timedelta(days=7)

        # API calls per org (7d) for active projects only
        if proj_rows:
            calls_rows = (
                db.query(Project.organization_id, func.count(APICall.id))
                .join(APICall, APICall.project_id == Project.id)
                .filter(
                    Project.organization_id.in_(org_ids),
                    Project.is_active.is_(True),
                    Project.is_deleted.is_(False),
                    APICall.created_at >= seven_days_ago,
                    APICall.created_at <= now,
                )
                .group_by(Project.organization_id)
                .all()
            )
            calls_map.update({oid: count for oid, count in calls_rows})

        # Alerts per org (open, active projects only)
        alerts_rows = (
            db.query(Project.organization_id, func.count(Alert.id))
            .join(Alert, Alert.project_id == Project.id)
            .filter(
                Project.organization_id.in_(org_ids),
                Project.is_active.is_(True),
                Project.is_deleted.is_(False),
                Alert.is_resolved.is_(False),
            )
            .group_by(Project.organization_id)
            .all()
        )
        alerts_map.update({oid: count for oid, count in alerts_rows})

        # Drift projects per org (active projects that have any drift alerts)
        drift_rows = (
            db.query(Project.organization_id, func.count(func.distinct(Alert.project_id)))
            .join(Alert, Alert.project_id == Project.id)
            .filter(
                Project.organization_id.in_(org_ids),
                Project.is_active.is_(True),
                Project.is_deleted.is_(False),
                Alert.alert_type == "drift",
                Alert.is_resolved.is_(False),
            )
            .group_by(Project.organization_id)
            .all()
        )
        drift_map.update({oid: count for oid, count in drift_rows})

        # Cost per org can be computed using cost_analyzer.analyze_project_costs() if needed

    summaries: List[OrganizationSummary] = []
    for org in orgs:
        current_role = _get_org_role(db, org.id, current_user, org)
        summaries.append(
            OrganizationSummary(
                id=org.id,
                name=org.name,
                plan_type=account_plan_type,
                projects_count=projects_counts.get(org.id, 0),
                calls_7d=calls_map.get(org.id, 0),
                cost_7d=cost_map.get(org.id, 0.0),
                alerts_open=alerts_map.get(org.id, 0),
                drift_projects=drift_map.get(org.id, 0),
                current_user_role=current_role,
                membership_source=_get_org_membership_source(current_user, org),
            )
        )

    return summaries


@router.get("/{org_id}")
def get_organization(
    org_id: int,
    include_stats: bool = Query(False, description="Include usage stats and alerts"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
):
    """Get organization details with optional stats."""
    logger.info(f"🔵 GET ORGANIZATION: org_id={org_id}, include_stats={include_stats}, user_id={current_user.id}")
    account_plan_type = str(SubscriptionService(db).get_user_plan(current_user.id).get("plan_type") or "free")
    
    try:
        # Use service to get organization
        org = org_service.get_organization_by_id(org_id)
        if not org:
            logger.warning(f"🔴 Organization not found: org_id={org_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        
        # Check access
        is_owner = org.owner_id == current_user.id
        is_member = False
        if not is_owner:
            is_member = (
                db.query(OrganizationMember)
                .filter(
                    OrganizationMember.organization_id == org_id,
                    OrganizationMember.user_id == current_user.id
                )
                .first() is not None
            )
        
        if not (is_owner or is_member):
            logger.warning(f"🔴 Access denied: user_id={current_user.id}, org_id={org_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this organization"
            )

        if not include_stats:
            logger.info(f"✅ Returning organization without stats: org_id={org_id}")
            current_role = _get_org_role(db, org_id, current_user, org)
            return OrganizationDetail(
                id=org.id,
                name=org.name,
                description=getattr(org, "description", None),
                type=org.type,
                plan_type=account_plan_type,
                stats=None,
                current_user_role=current_role,
                membership_source=_get_org_membership_source(current_user, org),
            )

        # Get all projects for this org (include_stats=True)
        logger.info(f"📊 Calculating stats for org_id={org_id}")

        try:
            projects = (
                db.query(Project)
                .filter(
                    Project.organization_id == org_id,
                    Project.is_active.is_(True),
                    Project.is_deleted.is_(False),
                )
                .all()
            )
            project_ids = [p.id for p in projects]
            logger.info(f"📁 Found {len(projects)} projects for org_id={org_id}")
        except Exception as e:
            logger.error(f"🔴 Error querying projects: {str(e)}", exc_info=True)
            raise

        now = _utcnow_naive()
        seven_days_ago = now - timedelta(days=7)

        calls_count = 0
        total_cost = 0.0
        quality_scores = []

        if project_ids:
            try:
                logger.info(f"📞 Querying API calls for {len(project_ids)} projects")
                calls_count = (
                    db.query(func.count(APICall.id))
                    .filter(
                        APICall.project_id.in_(project_ids),
                        APICall.created_at >= seven_days_ago,
                        APICall.created_at <= now,
                    )
                    .scalar()
                    or 0
                )
                logger.info(f"✅ API calls count: {calls_count}")
            except Exception as e:
                logger.warning(f"Failed to query API calls for org {org_id}: {str(e)}", exc_info=True)
                calls_count = 0

            for project_id in project_ids:
                try:
                    cost_analysis = cost_analyzer.analyze_project_costs(
                        project_id=project_id,
                        start_date=seven_days_ago,
                        end_date=now,
                        db=db,
                    )
                    total_cost += cost_analysis.get("total_cost", 0.0)
                except Exception as e:
                    logger.warning(f"Failed to calculate cost for project {project_id}: {str(e)}", exc_info=True)

            try:
                quality_rows = (
                    db.query(func.avg(QualityScore.score))
                    .filter(
                        QualityScore.project_id.in_(project_ids),
                        QualityScore.created_at >= seven_days_ago,
                    )
                    .scalar()
                )
                avg_quality = float(quality_rows) if quality_rows is not None else 0.0
            except (ValueError, TypeError, Exception) as e:
                logger.warning(f"Failed to query quality scores for org {org_id}: {str(e)}", exc_info=True)
                avg_quality = 0.0
        else:
            avg_quality = 0.0

        calls_limit, cost_limit = _owner_usage_limit_caps(db, org)
        limits = {"calls": calls_limit, "cost": cost_limit}

        alerts_list = []
        if project_ids:
            try:
                recent_alerts = (
                    db.query(Alert, Project.name)
                    .join(Project, Alert.project_id == Project.id)
                    .filter(
                        Alert.project_id.in_(project_ids),
                        Alert.is_resolved.is_(False),
                    )
                    .order_by(Alert.created_at.desc())
                    .limit(10)
                    .all()
                )
                for alert, project_name in recent_alerts:
                    alerts_list.append(
                        {
                            "project": project_name,
                            "summary": alert.title or "Alert detected",
                            "severity": alert.severity or "medium",
                        }
                    )
            except Exception as e:
                logger.warning(f"Failed to query alerts for org {org_id}: {str(e)}", exc_info=True)
                alerts_list = []

        logger.info(f"✅ Building response for org_id={org_id}")
        return {
            "id": org.id,
            "name": org.name,
            "description": getattr(org, "description", None),
            "type": org.type,
            "plan_type": account_plan_type,
            "current_user_role": _get_org_role(db, org_id, current_user, org),
            "membership_source": _get_org_membership_source(current_user, org),
            "stats": {
                "usage": {
                    "calls": calls_count,
                    "calls_limit": limits["calls"],
                    "cost": round(total_cost, 2),
                    "cost_limit": limits["cost"],
                    "quality": round(avg_quality, 1),
                },
                "alerts": alerts_list,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔴🔴🔴 GET ORGANIZATION ERROR: {type(e).__name__}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


@router.get("/{org_id}/members", response_model=List[OrganizationMemberResponse])
@handle_errors
def list_organization_members(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
):
    """List organization members (owner/admin only)."""
    org, _ = _require_org_access(
        db,
        org_id,
        current_user,
        org_service,
        required_roles=[OrganizationMemberRole.OWNER.value, OrganizationMemberRole.ADMIN.value],
    )

    memberships = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id)
        .order_by(OrganizationMember.created_at.asc(), OrganizationMember.id.asc())
        .all()
    )

    result: List[OrganizationMemberResponse] = []
    seen_user_ids = set()
    for membership in memberships:
        if not membership.user:
            continue
        if membership.user_id in seen_user_ids:
            continue
        seen_user_ids.add(membership.user_id)
        result.append(
            OrganizationMemberResponse(
                id=membership.id,
                user_id=membership.user_id,
                email=membership.user.email,
                full_name=membership.user.full_name,
                role=str(membership.role),
                joined_at=membership.created_at.isoformat(),
            )
        )

    if org.owner_id not in seen_user_ids and org.owner:
        result.insert(
            0,
            OrganizationMemberResponse(
                id=0,
                user_id=org.owner.id,
                email=org.owner.email,
                full_name=org.owner.full_name,
                role=OrganizationMemberRole.OWNER.value,
                joined_at=org.created_at.isoformat() if org.created_at else _utcnow_naive().isoformat(),
            ),
        )

    return result


@router.post("/{org_id}/members", response_model=OrganizationMemberResponse, status_code=status.HTTP_201_CREATED)
@handle_errors
def add_organization_member(
    org_id: int,
    member_data: OrganizationMemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
    user_service = Depends(get_user_service),
):
    """Invite/add organization member (owner/admin only)."""
    _require_org_access(
        db,
        org_id,
        current_user,
        org_service,
        required_roles=[OrganizationMemberRole.OWNER.value, OrganizationMemberRole.ADMIN.value],
    )

    user = user_service.get_user_by_email(member_data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"User with email '{member_data.email}' not found. "
                "The user must have an existing PluvianAI account with this email address."
            ),
        )

    plan_info = SubscriptionService(db).get_user_plan(current_user.id)
    limits = plan_info.get("limits") or {}
    member_limit = int(limits.get("team_members_per_project", 1))
    if member_limit != -1:
        current_members = (
            db.query(OrganizationMember)
            .filter(OrganizationMember.organization_id == org_id)
            .count()
        )
        if current_members >= member_limit:
            remaining = max(0, int(member_limit) - int(current_members))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "TEAM_MEMBER_LIMIT_REACHED",
                    "message": "You have reached the team member limit for your current plan.",
                    "details": {
                        "plan_type": str(plan_info.get("plan_type") or "free"),
                        "metric": "team_members",
                        "current": int(current_members),
                        "limit": int(member_limit),
                        "remaining": remaining,
                        "reset_at": None,
                        "upgrade_path": "/settings/billing",
                    },
                },
            )

    try:
        member = org_service.add_member(
            organization_id=org_id,
            user_id=user.id,
            role=member_data.role.value,
        )
    except EntityAlreadyExistsError as e:
        logger.warning("Organization member add rejected: already exists", extra={"reason": str(e)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That user is already a member of this organization.",
        )

    return OrganizationMemberResponse(
        id=member.id,
        user_id=member.user_id,
        email=user.email,
        full_name=user.full_name,
        role=member.role,
        joined_at=member.created_at.isoformat(),
    )


@router.delete("/{org_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
def remove_organization_member(
    org_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
):
    """Remove organization member (owner/admin only, owner cannot be removed)."""
    org, _ = _require_org_access(
        db,
        org_id,
        current_user,
        org_service,
        required_roles=[OrganizationMemberRole.OWNER.value, OrganizationMemberRole.ADMIN.value],
    )

    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.id == member_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if member.user_id == org.owner_id or str(member.role) == OrganizationMemberRole.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove organization owner",
        )

    db.delete(member)
    return None


@router.get("/{org_id}/projects", response_model=List[OrgProjectSummary])
def list_org_projects(
    org_id: int,
    include_stats: bool = Query(True, description="Include project metrics"),
    search: Optional[str] = Query(None, description="Search projects by name or description"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
    project_service = Depends(get_project_service),
):
    """List projects for an organization with basic metrics."""
    logger.info(f"🔵 GET ORG PROJECTS: org_id={org_id}, include_stats={include_stats}, user_id={current_user.id}")
    
    try:
        # Use service to get organization
        org = org_service.get_organization_by_id(org_id)
        if not org:
            logger.warning(f"🔴 Organization not found: org_id={org_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        
        # Check access using service
        user_orgs = org_service.get_organizations_by_user_id(current_user.id)
        user_org_ids = [o.id for o in user_orgs]
        if org_id not in user_org_ids:
            logger.warning(f"🔴 Access denied: user_id={current_user.id}, org_id={org_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this organization"
            )

        # Use service to get projects
        logger.info(f"📁 Getting projects for org_id={org_id}")
        projects = project_service.get_projects_by_organization_id(org_id)
        logger.info(f"📁 Found {len(projects)} projects")
        
        # Apply search filter if provided
        if search:
            search_term = search.strip().lower()
            projects = [
                p for p in projects
                if search_term in (p.name or "").lower() or search_term in (p.description or "").lower()
            ]
        
        # Sort by created_at descending (handle None; avoid comparing naive/aware)
        def _sort_key(p):
            ct = getattr(p, "created_at", None)
            return (0 if ct is None else 1, ct.isoformat() if ct is not None else "")
        projects = sorted(projects, key=_sort_key, reverse=True)

        if not projects:
            logger.info(f"✅ No projects found for org_id={org_id}")
            return []

        project_ids = [p.id for p in projects]
        now = _utcnow_naive()
        day_ago = now - timedelta(days=1)
        seven_days_ago = now - timedelta(days=7)

        calls_map = {pid: 0 for pid in project_ids}
        cost_map = {pid: 0.0 for pid in project_ids}
        quality_map = {pid: None for pid in project_ids}
        alerts_map = {pid: 0 for pid in project_ids}
        drift_map = {pid: False for pid in project_ids}

        if include_stats:
            # Calls 24h
            try:
                calls_rows = (
                    db.query(APICall.project_id, func.count(APICall.id))
                    .filter(
                        APICall.project_id.in_(project_ids),
                        APICall.created_at >= day_ago,
                        APICall.created_at <= now,
                    )
                    .group_by(APICall.project_id)
                    .all()
                )
                calls_map.update({pid: count for pid, count in calls_rows})
            except Exception as e:
                logger.warning(f"Failed to query API calls: {str(e)}", exc_info=True)

            # Cost 7d - calculate using CostAnalyzer
            for project_id in project_ids:
                try:
                    cost_analysis = cost_analyzer.analyze_project_costs(
                        project_id=project_id,
                        start_date=seven_days_ago,
                        end_date=now,
                        db=db,
                    )
                    cost_map[project_id] = round(cost_analysis.get("total_cost", 0.0), 2)
                except Exception as e:
                    # Skip if cost calculation fails
                    logger.warning(f"Failed to calculate cost for project {project_id}: {str(e)}", exc_info=True)
                    cost_map[project_id] = 0.0

            # Quality (average of recent quality scores, 7d)
            try:
                quality_rows = (
                    db.query(
                        QualityScore.project_id,
                        func.avg(QualityScore.score).label("avg_quality"),
                    )
                    .filter(
                        QualityScore.project_id.in_(project_ids),
                        QualityScore.created_at >= seven_days_ago,
                    )
                    .group_by(QualityScore.project_id)
                .all()
                )
                for row in quality_rows:
                    try:
                        pid = row[0] if isinstance(row, tuple) else row.project_id
                        avg_q = row[1] if isinstance(row, tuple) else getattr(row, 'avg_quality', None)
                        if avg_q is not None:
                            quality_map[pid] = round(float(avg_q), 1)
                    except (ValueError, TypeError, AttributeError) as e:
                        logger.warning(f"Failed to process quality row for project {pid}: {str(e)}")
                        continue
            except Exception as e:
                logger.error(f"Failed to query quality scores: {str(e)}", exc_info=True)

            # Alerts open
            try:
                alerts_rows = (
                    db.query(Alert.project_id, func.count(Alert.id))
                    .filter(Alert.project_id.in_(project_ids), Alert.is_resolved.is_(False))
                    .group_by(Alert.project_id)
                    .all()
                )
                alerts_map.update({pid: count for pid, count in alerts_rows})
            except Exception as e:
                logger.warning(f"Failed to query alerts: {str(e)}", exc_info=True)

            # Drift flag
            try:
                drift_rows = (
                    db.query(Alert.project_id, func.count(Alert.id))
                    .filter(
                        Alert.project_id.in_(project_ids),
                        Alert.alert_type == "drift",
                        Alert.is_resolved.is_(False),
                    )
                    .group_by(Alert.project_id)
                    .all()
                )
                drift_map.update({pid: count > 0 for pid, count in drift_rows})
            except Exception as e:
                logger.warning(f"Failed to query drift alerts: {str(e)}", exc_info=True)

        current_org_role = _get_org_role(db, org_id, current_user, org)
        results: List[OrgProjectSummary] = []
        for p in projects:
            access_context = get_project_access_context(p, current_user.id, db)
            results.append(
                OrgProjectSummary(
                    id=p.id,
                    name=p.name,
                    description=p.description,
                    calls_24h=calls_map.get(p.id, 0),
                    cost_7d=cost_map.get(p.id, 0.0),
                    quality=quality_map.get(p.id),
                    alerts_open=alerts_map.get(p.id, 0),
                    drift=drift_map.get(p.id, False),
                    role=access_context.get("role"),
                    org_role=access_context.get("org_role") or current_org_role,
                    access_source=access_context.get("access_source"),
                    created_by_me=access_context.get("created_by_me"),
                    has_project_access=access_context.get("has_project_access"),
                    owner_name=getattr(getattr(p, "owner", None), "full_name", None),
                    entitlement_scope=access_context.get("entitlement_scope"),
                )
            )

        logger.info(f"✅ Returning {len(results)} projects for org_id={org_id}")
        return results
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔴🔴🔴 ORG PROJECTS ERROR: {type(e).__name__}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


@router.patch("/{org_id}", response_model=OrganizationDetail)
@handle_errors
def update_organization(
    org_id: int,
    org_data: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
):
    """Update organization details."""
    logger.info(f"🔵 PATCH ORGANIZATION: org_id={org_id}, user_id={current_user.id}")
    
    # Check if organization exists
    org = org_service.get_organization_by_id(org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    
    # Check access (only owner can update)
    if org.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This action requires organization owner role. "
                "Ask the organization owner to update your role if needed."
            ),
        )
    
    updated_org = org_service.update_organization(
        org_id=org_id,
        name=org_data.name,
        description=org_data.description
    )
    return updated_org


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
def delete_organization(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_service = Depends(get_organization_service),
):
    """Soft-delete an organization and all its projects."""
    logger.info(f"🔵 DELETE ORGANIZATION: org_id={org_id}, user_id={current_user.id}")
    
    # Check if organization exists
    org = org_service.get_organization_by_id(org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    
    # Check access (only owner can delete)
    if org.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This action requires organization owner role. "
                "Ask the organization owner to update your role if needed."
            ),
        )
    
    success = org_service.delete_organization(org_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete organization"
        )

    _invalidate_project_list_caches_for_org(db, org)

    return None

