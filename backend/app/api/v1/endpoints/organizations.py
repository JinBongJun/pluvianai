"""
Organization endpoints for org-first architecture.
"""

from typing import List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.organization import Organization, OrganizationMember
from app.models.project import Project
from app.models.api_call import APICall
from app.models.alert import Alert


router = APIRouter()


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: Optional[str] = Field(
        None, description="personal, startup, company, agency, educational, na"
    )
    plan_type: str = Field("free", pattern="^(free|pro|enterprise)$")


class OrganizationSummary(BaseModel):
    id: int
    name: str
    plan_type: str
    projects_count: int
    calls_7d: int
    cost_7d: float
    alerts_open: int
    drift_projects: int

    class Config:
        from_attributes = True


class OrganizationDetail(BaseModel):
    id: int
    name: str
    type: Optional[str]
    plan_type: str

    class Config:
        from_attributes = True


class OrgProjectSummary(BaseModel):
    id: int
    name: str
    description: Optional[str]
    calls_24h: int
    cost_7d: float
    quality: Optional[float]
    alerts_open: int
    drift: bool

    class Config:
        from_attributes = True


def _get_user_orgs(db: Session, user: User) -> List[Organization]:
    """
    Get organizations where user is owner or member.
    For now, we only support owner-based orgs to keep it simple.
    """
    return (
        db.query(Organization)
        .filter(Organization.owner_id == user.id)
        .order_by(Organization.created_at.desc())
        .all()
    )


@router.post("", response_model=OrganizationDetail, status_code=status.HTTP_201_CREATED)
def create_organization(
    org_data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new organization for the current user."""
    name = org_data.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization name is required",
        )

    # Optional: Check duplicate name for this owner
    existing = (
        db.query(Organization)
        .filter(Organization.owner_id == current_user.id, Organization.name == name)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organization with this name already exists",
        )

    org = Organization(
        name=name,
        type=org_data.type,
        plan_type=org_data.plan_type or "free",
        owner_id=current_user.id,
    )
    db.add(org)
    db.flush()  # get org.id

    # Create owner membership
    member = OrganizationMember(
        organization_id=org.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(member)
    db.commit()
    db.refresh(org)

    return org


@router.get("", response_model=List[OrganizationSummary])
def list_organizations(
    include_stats: bool = Query(True, description="Include basic usage stats"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List organizations for the current user with optional stats."""
    orgs = _get_user_orgs(db, current_user)

    if not orgs:
        return []

    org_ids = [o.id for o in orgs]

    # Base projects count per org
    projects_counts = dict(
        db.query(Project.organization_id, func.count(Project.id))
        .filter(Project.organization_id.in_(org_ids))
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
            .filter(Project.organization_id.in_(org_ids))
            .all()
        )
        org_to_project_ids = {}
        for pid, oid in proj_rows:
            org_to_project_ids.setdefault(oid, []).append(pid)

        now = datetime.utcnow()
        seven_days_ago = now - timedelta(days=7)

        # API calls per org (7d)
        if proj_rows:
            calls_rows = (
                db.query(Project.organization_id, func.count(APICall.id))
                .join(APICall, APICall.project_id == Project.id)
                .filter(
                    Project.organization_id.in_(org_ids),
                    APICall.created_at >= seven_days_ago,
                    APICall.created_at <= now,
                )
                .group_by(Project.organization_id)
                .all()
            )
            calls_map.update({oid: count for oid, count in calls_rows})

        # Alerts per org (open)
        alerts_rows = (
            db.query(Project.organization_id, func.count(Alert.id))
            .join(Alert, Alert.project_id == Project.id)
            .filter(Project.organization_id.in_(org_ids), Alert.is_resolved.is_(False))
            .group_by(Project.organization_id)
            .all()
        )
        alerts_map.update({oid: count for oid, count in alerts_rows})

        # Drift projects per org (projects that have any drift alerts)
        drift_rows = (
            db.query(Project.organization_id, func.count(func.distinct(Alert.project_id)))
            .join(Alert, Alert.project_id == Project.id)
            .filter(
                Project.organization_id.in_(org_ids),
                Alert.alert_type == "drift",
                Alert.is_resolved.is_(False),
            )
            .group_by(Project.organization_id)
            .all()
        )
        drift_map.update({oid: count for oid, count in drift_rows})

        # TODO: Cost per org (7d) – can be computed using cost analyzer in future

    summaries: List[OrganizationSummary] = []
    for org in orgs:
        summaries.append(
            OrganizationSummary(
                id=org.id,
                name=org.name,
                plan_type=org.plan_type,
                projects_count=projects_counts.get(org.id, 0),
                calls_7d=calls_map.get(org.id, 0),
                cost_7d=cost_map.get(org.id, 0.0),
                alerts_open=alerts_map.get(org.id, 0),
                drift_projects=drift_map.get(org.id, 0),
            )
        )

    return summaries


@router.get("/{org_id}", response_model=OrganizationDetail)
def get_organization(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get organization details (basic info)."""
    org = (
        db.query(Organization)
        .filter(Organization.id == org_id, Organization.owner_id == current_user.id)
        .first()
    )
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.get("/{org_id}/projects", response_model=List[OrgProjectSummary])
def list_org_projects(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List projects for an organization with basic metrics."""
    # Verify org access (owner only for now)
    org = (
        db.query(Organization)
        .filter(Organization.id == org_id, Organization.owner_id == current_user.id)
        .first()
    )
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    projects = (
        db.query(Project)
        .filter(Project.organization_id == org_id)
        .order_by(Project.created_at.desc())
        .all()
    )

    if not projects:
        return []

    project_ids = [p.id for p in projects]
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    seven_days_ago = now - timedelta(days=7)

    # Calls 24h
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
    calls_map = {pid: count for pid, count in calls_rows}

    # Alerts open
    alerts_rows = (
        db.query(Alert.project_id, func.count(Alert.id))
        .filter(Alert.project_id.in_(project_ids), Alert.is_resolved.is_(False))
        .group_by(Alert.project_id)
        .all()
    )
    alerts_map = {pid: count for pid, count in alerts_rows}

    # Drift flag
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
    drift_map = {pid: count > 0 for pid, count in drift_rows}

    # TODO: Cost and quality per project – can be added using existing services

    results: List[OrgProjectSummary] = []
    for p in projects:
        results.append(
            OrgProjectSummary(
                id=p.id,
                name=p.name,
                description=p.description,
                calls_24h=calls_map.get(p.id, 0),
                cost_7d=0.0,
                quality=None,
                alerts_open=alerts_map.get(p.id, 0),
                drift=drift_map.get(p.id, False),
            )
        )

    return results

