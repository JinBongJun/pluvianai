from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.snapshot import Snapshot
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.live_view_connection import LiveViewConnection
from app.models.project import Project

router = APIRouter()


def _ensure_project(project_id: int, current_user: User, db: Session) -> Project:
    return check_project_access(project_id, current_user, db)


@router.get("/projects/{project_id}/live-view/agents")
def list_agents(
    project_id: int,
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return detected agents (boxes) for Live View by grouping snapshots.
    """
    _ensure_project(project_id, current_user, db)

    # Aggregate snapshots by agent_id (fallback to 'unknown' if missing)
    rows = (
        db.query(
            Snapshot.agent_id,
            Snapshot.model,
            Snapshot.system_prompt,
            db.func.count(Snapshot.id).label("total"),
            db.func.sum(db.case((Snapshot.is_worst == True, 1), else_=0)).label("worst_count"),
            db.func.max(Snapshot.created_at).label("last_seen"),
        )
        .filter(Snapshot.project_id == project_id)
        .group_by(Snapshot.agent_id, Snapshot.model, Snapshot.system_prompt)
        .order_by(db.func.max(Snapshot.created_at).desc())
        .limit(limit)
        .all()
    )

    # Fetch display settings
    agent_ids = [r.agent_id or "unknown" for r in rows]
    settings = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash.in_(agent_ids))
        .all()
    )
    settings_map = {s.system_prompt_hash: s for s in settings}

    def serialize(row):
        agent_id = row.agent_id or "unknown"
        setting = settings_map.get(agent_id)
        return {
            "agent_id": agent_id,
            "display_name": setting.display_name if setting and setting.display_name else (agent_id or "Agent"),
            "model": row.model,
            "system_prompt": row.system_prompt,
            "total": row.total,
            "worst_count": int(row.worst_count or 0),
            "last_seen": row.last_seen,
            "is_deleted": setting.is_deleted if setting else False,
        }

    return {"agents": [serialize(r) for r in rows]}


@router.get("/projects/{project_id}/live-view/agents/{agent_id}/settings")
def get_agent_settings(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if not setting:
        return {"agent_id": agent_id, "display_name": None, "is_deleted": False}
    return {"agent_id": agent_id, "display_name": setting.display_name, "is_deleted": setting.is_deleted}


@router.patch("/projects/{project_id}/live-view/agents/{agent_id}/settings")
def update_agent_settings(
    project_id: int,
    agent_id: str,
    display_name: Optional[str] = None,
    is_deleted: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if not setting:
        setting = AgentDisplaySetting(
            id=str(uuid.uuid4()),
            project_id=project_id,
            system_prompt_hash=agent_id,
            display_name=display_name,
            is_deleted=is_deleted or False,
        )
        db.add(setting)
    else:
        if display_name is not None:
            setting.display_name = display_name
        if is_deleted is not None:
            setting.is_deleted = is_deleted
    db.commit()
    db.refresh(setting)
    return {"agent_id": agent_id, "display_name": setting.display_name, "is_deleted": setting.is_deleted}


@router.delete("/projects/{project_id}/live-view/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if setting:
        setting.is_deleted = True
        db.commit()
    return None


@router.get("/projects/{project_id}/live-view/connections")
def list_connections(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)
    conns = (
        db.query(LiveViewConnection)
        .filter(LiveViewConnection.project_id == project_id)
        .order_by(LiveViewConnection.created_at.desc())
        .all()
    )
    return {"connections": [
        {
            "id": c.id,
            "source_agent_name": c.source_agent_name,
            "target_agent_name": c.target_agent_name,
            "created_by": c.created_by,
            "created_at": c.created_at,
        }
        for c in conns
    ]}


@router.post("/projects/{project_id}/live-view/connections", status_code=status.HTTP_201_CREATED)
def create_connection(
    project_id: int,
    source_agent_name: str,
    target_agent_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)
    conn = LiveViewConnection(
        id=str(uuid.uuid4()),
        project_id=project_id,
        source_agent_name=source_agent_name,
        target_agent_name=target_agent_name,
        created_by=current_user.id if current_user else None,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return {
        "id": conn.id,
        "source_agent_name": conn.source_agent_name,
        "target_agent_name": conn.target_agent_name,
        "created_by": conn.created_by,
        "created_at": conn.created_at,
    }


@router.delete("/projects/{project_id}/live-view/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    project_id: int,
    connection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)
    deleted = (
        db.query(LiveViewConnection)
        .filter(LiveViewConnection.project_id == project_id, LiveViewConnection.id == connection_id)
        .delete()
    )
    if deleted == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    db.commit()
    return None


@router.get("/projects/{project_id}/snapshots")
def list_snapshots(
    project_id: int,
    agent_id: Optional[str] = None,
    is_worst: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Snapshot list with filters for Live View.
    """
    _ensure_project(project_id, current_user, db)
    query = db.query(Snapshot).filter(Snapshot.project_id == project_id)
    if agent_id:
        query = query.filter(Snapshot.agent_id == agent_id)
    if is_worst is not None:
        query = query.filter(Snapshot.is_worst == is_worst)

    items = (
        query.order_by(Snapshot.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": s.id,
                "agent_id": s.agent_id,
                "model": s.model,
                "system_prompt": s.system_prompt,
                "user_message": s.user_message,
                "response": s.response,
                "request_prompt": s.user_message,
                "response_text": s.response,
                "latency_ms": s.latency_ms,
                "tokens_used": s.tokens_used,
                "cost": s.cost,
                "is_worst": s.is_worst,
                "worst_status": s.worst_status,
                "created_at": s.created_at,
            }
            for s in items
        ],
        "count": len(items),
        "limit": limit,
        "offset": offset,
    }
