from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.core.permissions import get_user_organization_role
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.services.cache_service import cache_service


def release_gate_hot_access_cache_key(project_id: int, user_id: int) -> str:
    return f"user:{int(user_id)}:project:{int(project_id)}:release_gate_hot_access"


def ensure_release_gate_hot_path_access(
    project_id: int,
    user_id: int,
    db: Session,
    *,
    access_cache_ttl_sec: int,
) -> None:
    if cache_service.enabled:
        cached = cache_service.get(release_gate_hot_access_cache_key(project_id, user_id))
        if isinstance(cached, dict):
            if cached.get("not_found"):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
            if cached.get("allowed"):
                return
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this project",
            )

    row = (
        db.query(
            Project.id.label("project_id"),
            Project.owner_id.label("owner_id"),
            Project.organization_id.label("organization_id"),
            Project.is_active.label("is_active"),
            Project.is_deleted.label("is_deleted"),
            ProjectMember.role.label("member_role"),
        )
        .outerjoin(
            ProjectMember,
            and_(ProjectMember.project_id == Project.id, ProjectMember.user_id == user_id),
        )
        .filter(Project.id == project_id)
        .first()
    )
    if not row or not row.is_active or row.is_deleted:
        if cache_service.enabled:
            cache_service.set(
                release_gate_hot_access_cache_key(project_id, user_id),
                {"not_found": True, "allowed": False},
                ttl=access_cache_ttl_sec,
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    org_role = get_user_organization_role(getattr(row, "organization_id", None), user_id, db)
    allowed = int(row.owner_id or 0) == user_id or bool(row.member_role) or bool(org_role)
    if cache_service.enabled:
        cache_service.set(
            release_gate_hot_access_cache_key(project_id, user_id),
            {"not_found": False, "allowed": allowed},
            ttl=access_cache_ttl_sec,
        )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project",
        )
