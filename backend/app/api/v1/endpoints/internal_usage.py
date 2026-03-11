from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_admin
from app.models.user import User
from app.models.usage import Usage
from app.models.project import Project


router = APIRouter(prefix="/usage", tags=["internal-usage"])


class ProjectUsageItem(BaseModel):
    project_id: int | None
    project_name: str | None
    owner_email: str | None
    total_credits: int
    runs: int


class ProjectUsageResponse(BaseModel):
    month: str
    items: List[ProjectUsageItem]


def _parse_month(month: str) -> tuple[datetime, datetime]:
    """
    Parse a YYYY-MM string into [start, end) datetimes for that month (UTC).
    """
    try:
        start = datetime.strptime(month + "-01", "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid month format. Expected YYYY-MM.",
        )

    year = start.year
    next_month = start.month + 1
    if next_month == 13:
        next_month = 1
        year += 1
    end = start.replace(year=year, month=next_month)
    return start, end


@router.get(
    "/credits/by-project",
    response_model=ProjectUsageResponse,
    summary="Get platform replay credit usage by project for a given month (admin only).",
)
def get_guard_credits_by_project(
    month: str = Query(..., description="Billing month in YYYY-MM format, e.g. 2026-03"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectUsageResponse:
    """
    Aggregate hosted replay credit usage per project for the given month.

    This is an internal/admin-only endpoint intended for monitoring platform
    cost exposure during MVP / beta.
    """
    require_admin(current_user)

    start, end = _parse_month(month)

    # Aggregate hosted replay credit usage.
    query = (
        db.query(
            Usage.project_id,
            func.coalesce(Project.name, "").label("project_name"),
            func.coalesce(User.email, "").label("owner_email"),
            func.coalesce(func.sum(Usage.quantity), 0).label("total_credits"),
            func.count(Usage.id).label("runs"),
        )
        .outerjoin(Project, Usage.project_id == Project.id)
        .outerjoin(User, Project.owner_id == User.id)
        .filter(
            Usage.metric_name == "guard_credits_replay",
            Usage.timestamp >= start,
            Usage.timestamp < end,
        )
        .group_by(Usage.project_id, Project.name, User.email)
        .order_by(func.coalesce(func.sum(Usage.quantity), 0).desc())
    )

    items: List[ProjectUsageItem] = []
    for row in query.all():
        items.append(
            ProjectUsageItem(
                project_id=row.project_id,
                project_name=row.project_name or None,
                owner_email=row.owner_email or None,
                total_credits=int(row.total_credits or 0),
                runs=int(row.runs or 0),
            )
        )

    return ProjectUsageResponse(month=month, items=items)

