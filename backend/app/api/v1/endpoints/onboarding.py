from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_onboarding_service
from app.core.security import get_current_user
from app.models.project import Project
from app.models.user import User
from app.services.onboarding_service import OnboardingService

router = APIRouter()


class SimulateTrafficRequest(BaseModel):
    project_id: int


def _ensure_owned_project(db: Session, user_id: int, project_id: int) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.owner_id == user_id, Project.is_deleted.is_(False))
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project not found or access denied",
        )
    return project


@router.get("/quick-start")
def get_quick_start(
    project_id: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    onboarding_service: OnboardingService = Depends(get_onboarding_service),
):
    return onboarding_service.generate_quick_start_guide(
        user_id=current_user.id,
        project_id=project_id,
    )


@router.post("/simulate")
def simulate_traffic(
    payload: SimulateTrafficRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    onboarding_service: OnboardingService = Depends(get_onboarding_service),
):
    _ensure_owned_project(db, current_user.id, payload.project_id)
    return onboarding_service.simulate_virtual_traffic(
        user_id=current_user.id,
        project_id=payload.project_id,
    )


@router.get("/status")
def get_onboarding_status(
    current_user: User = Depends(get_current_user),
    onboarding_service: OnboardingService = Depends(get_onboarding_service),
):
    return onboarding_service.check_onboarding_status(user_id=current_user.id)


@router.get("/first-snapshot-celebration")
def get_first_snapshot_celebration(
    project_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    onboarding_service: OnboardingService = Depends(get_onboarding_service),
):
    _ensure_owned_project(db, current_user.id, project_id)
    return onboarding_service.celebrate_first_snapshot(
        user_id=current_user.id,
        project_id=project_id,
    )
