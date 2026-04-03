from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.core.permissions import get_user_organization_role
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.services.cache_service import cache_service


@dataclass(frozen=True)
class LiveViewProjectRef:
    id: int
    owner_id: int
    canvas_nodes: Any


def live_view_hot_access_cache_key(project_id: int, user_id: int) -> str:
    return f"user:{int(user_id)}:project:{int(project_id)}:live_view_hot_access"


def live_view_hot_project_cache_key(project_id: int) -> str:
    return f"project:{int(project_id)}:live_view_hot_project_ref"


def cache_live_view_project_ref(project_ref: LiveViewProjectRef, ttl_sec: int) -> None:
    if not cache_service.enabled:
        return
    cache_service.set(
        live_view_hot_project_cache_key(project_ref.id),
        {
            "id": int(project_ref.id),
            "owner_id": int(project_ref.owner_id),
            "canvas_nodes": project_ref.canvas_nodes,
        },
        ttl=ttl_sec,
    )


def cached_live_view_project_ref(project_id: int) -> Optional[LiveViewProjectRef]:
    if not cache_service.enabled:
        return None
    cached = cache_service.get(live_view_hot_project_cache_key(project_id))
    if not isinstance(cached, dict):
        return None
    try:
        return LiveViewProjectRef(
            id=int(cached["id"]),
            owner_id=int(cached["owner_id"]),
            canvas_nodes=cached.get("canvas_nodes"),
        )
    except Exception:
        return None


def invalidate_live_view_project_ref_cache(project_id: int) -> None:
    if not cache_service.enabled:
        return
    cache_service.delete(live_view_hot_project_cache_key(project_id))


def load_live_view_project_ref(
    project_id: int,
    db: Session,
    *,
    project_cache_ttl_sec: int,
) -> LiveViewProjectRef:
    cached = cached_live_view_project_ref(project_id)
    if cached is not None:
        return cached

    row = (
        db.query(
            Project.id.label("project_id"),
            Project.owner_id.label("owner_id"),
            Project.canvas_nodes.label("canvas_nodes"),
            Project.is_active.label("is_active"),
            Project.is_deleted.label("is_deleted"),
        )
        .filter(Project.id == project_id)
        .first()
    )
    if not row or not row.is_active or row.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_ref = LiveViewProjectRef(
        id=int(row.project_id),
        owner_id=int(row.owner_id),
        canvas_nodes=row.canvas_nodes,
    )
    cache_live_view_project_ref(project_ref, project_cache_ttl_sec)
    return project_ref


def ensure_live_view_hot_path_access(
    project_id: int,
    user_id: int,
    db: Session,
    *,
    access_cache_ttl_sec: int,
    project_cache_ttl_sec: int,
) -> LiveViewProjectRef:
    if cache_service.enabled:
        cached = cache_service.get(live_view_hot_access_cache_key(project_id, user_id))
        if isinstance(cached, dict):
            if cached.get("not_found"):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
            if cached.get("allowed"):
                return load_live_view_project_ref(
                    project_id,
                    db,
                    project_cache_ttl_sec=project_cache_ttl_sec,
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this project",
            )

    row = (
        db.query(
            Project.id.label("project_id"),
            Project.owner_id.label("owner_id"),
            Project.organization_id.label("organization_id"),
            Project.canvas_nodes.label("canvas_nodes"),
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
                live_view_hot_access_cache_key(project_id, user_id),
                {"not_found": True, "allowed": False},
                ttl=access_cache_ttl_sec,
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    org_role = get_user_organization_role(getattr(row, "organization_id", None), user_id, db)
    allowed = int(row.owner_id or 0) == user_id or bool(row.member_role) or bool(org_role)
    if cache_service.enabled:
        cache_service.set(
            live_view_hot_access_cache_key(project_id, user_id),
            {"not_found": False, "allowed": allowed},
            ttl=access_cache_ttl_sec,
        )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project",
        )

    project_ref = LiveViewProjectRef(
        id=int(row.project_id),
        owner_id=int(row.owner_id),
        canvas_nodes=row.canvas_nodes,
    )
    cache_live_view_project_ref(project_ref, project_cache_ttl_sec)
    return project_ref
