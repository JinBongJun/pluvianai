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
from app.core.logging_config import logger
from app.models.user import User
from app.models.organization import Organization, OrganizationMember
from app.models.project import Project
from app.models.api_call import APICall
from app.models.alert import Alert
from app.models.quality_score import QualityScore
from app.services.cost_analyzer import CostAnalyzer


router = APIRouter()
cost_analyzer = CostAnalyzer()


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
    id: int
    name: str
    type: Optional[str]
    plan_type: str
    stats: Optional[dict] = None  # For backward compatibility

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


@router.get("/{org_id}")
def get_organization(
    org_id: int,
    include_stats: bool = Query(False, description="Include usage stats and alerts"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get organization details with optional stats."""
    # Check if user is owner or member
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this organization"
        )

    if not include_stats:
        return OrganizationDetail(
            id=org.id,
            name=org.name,
            type=org.type,
            plan_type=org.plan_type,
            stats=None,  # Explicitly set to None
        )

    # Get all projects for this org
    projects = db.query(Project).filter(Project.organization_id == org_id).all()
    project_ids = [p.id for p in projects]

    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)

    # Calculate usage stats
    calls_count = 0
    total_cost = 0.0
    quality_scores = []

    if project_ids:
        # API calls (7d)
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

        # Cost (7d) - calculate using CostAnalyzer
        for project_id in project_ids:
            try:
                cost_analysis = cost_analyzer.analyze_project_costs(
                    project_id=project_id,
                    start_date=seven_days_ago,
                    end_date=now,
                    db=db,
                )
                total_cost += cost_analysis.get("total_cost", 0.0)
            except Exception:
                # Skip if cost calculation fails
                pass

        # Quality (average of recent quality scores)
        quality_rows = (
            db.query(func.avg(QualityScore.overall_score))
            .filter(
                QualityScore.project_id.in_(project_ids),
                QualityScore.created_at >= seven_days_ago,
            )
            .scalar()
        )
        avg_quality = float(quality_rows) if quality_rows else 0.0
    else:
        avg_quality = 0.0

    # Get plan limits (based on plan_type)
    plan_limits = {
        "free": {"calls": 1000, "cost": 10.0},
        "pro": {"calls": 100000, "cost": 1000.0},
        "enterprise": {"calls": 1000000, "cost": 10000.0},
    }
    limits = plan_limits.get(org.plan_type, plan_limits["free"])

    # Get recent alerts
    alerts_list = []
    if project_ids:
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
                    "summary": alert.message or "Alert detected",
                    "severity": alert.severity or "medium",
                }
            )

    return {
        "id": org.id,
        "name": org.name,
        "type": org.type,
        "plan_type": org.plan_type,
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


@router.get("/{org_id}/projects", response_model=List[OrgProjectSummary])
def list_org_projects(
    org_id: int,
    include_stats: bool = Query(True, description="Include project metrics"),
    search: Optional[str] = Query(None, description="Search projects by name or description"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List projects for an organization with basic metrics."""
    # Verify org access (owner or member)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this organization"
        )

    # Base query
    query = db.query(Project).filter(Project.organization_id == org_id)

    # Apply search filter
    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            (Project.name.ilike(search_term)) | (Project.description.ilike(search_term))
        )

    projects = query.order_by(Project.created_at.desc()).all()

    if not projects:
        return []

    project_ids = [p.id for p in projects]
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    seven_days_ago = now - timedelta(days=7)

    # Defaults when stats disabled
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
                    func.avg(QualityScore.overall_score).label("avg_quality"),
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

    results: List[OrgProjectSummary] = []
    for p in projects:
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
            )
        )

    return results

