from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case, desc
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
import time
import uuid
import json
from pydantic import BaseModel, Field
from sqlalchemy.types import JSON
from app.core.logging_config import logger

from app.core.database import get_db, SessionLocal
from app.core.security import get_current_user
from app.core.dependencies import get_snapshot_service
from app.core.permissions import check_project_access, ProjectRole
from app.core.usage_limits import check_snapshot_limit
from app.models.user import User
from app.models.snapshot import Snapshot
from app.models.saved_log import SavedLog
from app.utils.tool_calls import extract_tool_calls_summary
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.agent_eval_config_history import AgentEvalConfigHistory
from app.models.project import Project
from app.services.cache_service import cache_service
from app.domain.live_view_release_gate import (
    build_agent_visibility_context,
    is_agent_deleted,
    restore_agent_if_soft_deleted,
)
from app.services.live_eval_service import (
    evaluate_recent_snapshots,
    normalize_eval_config,
    aggregate_stored_eval_checks,
    eval_config_version_hash,
)

router = APIRouter()

def _iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return str(dt)


def _ensure_project(project_id: int, current_user: User, db: Session) -> Project:
    return check_project_access(project_id, current_user, db)


def _ensure_project_admin(project_id: int, current_user: User, db: Session) -> Project:
    return check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])


class SaveLogsRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Snapshot IDs to save for the selected node.",
    )


class DeleteSavedLogsRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Snapshot IDs to remove from saved logs for the selected node.",
    )


class SnapshotBatchDeleteRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Snapshot IDs to soft-delete.",
    )


class SnapshotBatchActionRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Snapshot IDs for batch action.",
    )


class AgentHardDeleteRequest(BaseModel):
    agent_ids: List[str] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Agent IDs (system_prompt_hash) to hard-delete for this project.",
    )

@router.get("/projects/{project_id}/live-view/agents")
def list_agents(
    project_id: int,
    limit: int = Query(30, ge=1, le=100),
    include_deleted: bool = Query(False, description="Include soft-deleted agents in the response."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return detected agents (boxes) for Live View by grouping snapshots.
    """
    logger.info(f"LIST_AGENTS: Project={project_id}, User={current_user.id} ({current_user.email})")
    try:
        _ensure_project(project_id, current_user, db)

        # Hot-path cache: dashboard polls this endpoint frequently.
        # Short TTL prevents stale UX while dramatically reducing DB load and 429 risk.
        cache_key = f"project:{project_id}:live_view:agents:v2:limit={int(limit)}:include_deleted={int(bool(include_deleted))}"
        if cache_service.enabled:
            cached = cache_service.get(cache_key)
            if isinstance(cached, dict) and "agents" in cached:
                return cached

        # Aggregate snapshots by agent_id (fallback to 'unknown' if missing)
        rows = (
            db.query(
                Snapshot.agent_id,
                Snapshot.model,
                Snapshot.system_prompt,
                func.count(Snapshot.id).label("total"),
                func.max(Snapshot.created_at).label("last_seen"),
                # Aggregate 12 extreme diagnostic signals
                func.json_agg(func.cast(Snapshot.signal_result, JSON)).label("all_signals"),
                # Explicitly count worst snapshots using robust SQLAlchemy 2.0 syntax
                func.count(case((Snapshot.is_worst.is_(True), 1), else_=None)).label("worst_count")
            )
            .filter(Snapshot.project_id == project_id, Snapshot.is_deleted.is_(False))
            .group_by(Snapshot.agent_id, Snapshot.model, Snapshot.system_prompt)
            # Use label for ordering to avoid PostgreSQL grouping ambiguity on some versions
            .order_by(desc("last_seen"))
            .limit(limit)
            .all()
        )

        def _aggregate_signals(json_signals_list):
            """Helper to calculate average scores for the 12 factors"""
            if not json_signals_list:
                return {}
            
            agg = {}
            count = 0
            try:
                # json_agg returns a list of dictionaries in PostgreSQL
                signals_list = json_signals_list if isinstance(json_signals_list, list) else []
                if not signals_list and json_signals_list:
                    try:
                        signals_list = json.loads(json_signals_list)
                    except Exception as e:
                        logger.debug("_aggregate_signals: json.loads failed for signals_list", extra={"error": str(e)})
                
                for sig in signals_list:
                    if not sig: continue
                    count += 1
                    for k, v in sig.items():
                        agg[k] = agg.get(k, 0) + float(v)
                
                if count > 0:
                    return {k: round(v / count, 4) for k, v in agg.items()}
            except Exception as e:
                logger.debug("_aggregate_signals: aggregation failed", extra={"error": str(e)})
            return {}

        # Build shared visibility context used across Live View and Release Gate.
        project = _ensure_project(project_id, current_user, db)
        agent_ids = [r.agent_id or "unknown" for r in rows]
        visibility = build_agent_visibility_context(
            project_id=project_id,
            db=db,
            seed_agent_ids=agent_ids,
            project=project,
        )
        blueprint_map = visibility.blueprint_map
        sentinel_agents = visibility.sentinel_agents
        has_drift = visibility.has_drift
        settings_map = visibility.settings_map

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
                "last_seen": _iso(row.last_seen),
                "signals": _aggregate_signals(row.all_signals),
                "node_type": setting.node_type if setting else "agentCard",
                "is_deleted": setting.is_deleted if setting else False,
                "deleted_at": _iso(setting.deleted_at) if setting else None,
            }

        final_agents = []
        processed_ids = set()

        def _is_deleted(agent_id: str) -> bool:
            return is_agent_deleted(settings_map, agent_id)

        # 1. Start with Blueprint Nodes (Official)
        for node_id, node in blueprint_map.items():
            if node.get('type') != 'agentCard':
                continue
            is_deleted = _is_deleted(node_id)
            if is_deleted and not include_deleted:
                continue

            # Match snapshots
            stat = next((r for r in rows if r.agent_id == node_id), None)
            
            # Match sentinel drift info
            sentinel_node = next((n for n in sentinel_agents if n.get("id") == node_id), None)
            
            final_agents.append({
                "agent_id": node_id,
                "display_name": node.get('data', {}).get('label') or "Official Agent",
                "model": node.get('data', {}).get('model') or (stat.model if stat else "NEURAL_UNIT"),
                "system_prompt": node.get('data', {}).get('system_prompt') or (stat.system_prompt if stat else ""),
                "total": stat.total if stat else 0,
                "worst_count": int(stat.worst_count or 0) if stat else 0,
                "last_seen": _iso(stat.last_seen) if stat else _iso(datetime.now()),
                "signals": _aggregate_signals(stat.all_signals) if stat else {},
                "node_type": "agentCard",
                "is_official": True,
                "drift_status": "official",
                "is_deleted": is_deleted,
                "deleted_at": _iso(settings_map.get(node_id).deleted_at) if settings_map.get(node_id) else None,
                "position": node.get('position'),
            })
            processed_ids.add(node_id)

        # 2. Add Ghost Nodes (Detected by Sentinel but not in Blueprint)
        for s_node in sentinel_agents:
            s_id = s_node.get("id")
            if s_id in processed_ids:
                continue
            is_deleted = _is_deleted(s_id)
            if is_deleted and not include_deleted:
                continue

            stat = next((r for r in rows if r.agent_id == s_id), None)
            
            final_agents.append({
                "agent_id": s_id,
                "display_name": f"Ghost: {s_id}",
                "model": s_node.get("model") or (stat.model if stat else "UNKNOWN"),
                "total": stat.total if stat else 0,
                "worst_count": int(stat.worst_count or 0) if stat else 0,
                "last_seen": _iso(stat.last_seen) if stat else _iso(datetime.now()),
                "signals": _aggregate_signals(stat.all_signals) if stat else {},
                "node_type": "agentCard",
                "is_official": False,
                "drift_status": "ghost",
                "is_ghost": True,
                "is_deleted": is_deleted,
                "deleted_at": _iso(settings_map.get(s_id).deleted_at) if settings_map.get(s_id) else None,
            })
            processed_ids.add(s_id)

        # 3. Add any other detected snapshots (Probabilistic fallback)
        for row in rows:
            if row.agent_id not in processed_ids:
                if _is_deleted(row.agent_id or "unknown") and not include_deleted:
                    continue
                final_agents.append(serialize(row))
                processed_ids.add(row.agent_id or "unknown")

        # 4. Add setting-only nodes (no snapshots, not in blueprint/sentinel)
        for setting_agent_id, setting in settings_map.items():
            if setting_agent_id in processed_ids:
                continue
            if setting.is_deleted and not include_deleted:
                continue
            final_agents.append(
                {
                    "agent_id": setting_agent_id,
                    "display_name": setting.display_name or setting_agent_id,
                    "model": "UNKNOWN",
                    "system_prompt": "",
                    "total": 0,
                    "worst_count": 0,
                    "last_seen": None,
                    "signals": {},
                    "node_type": setting.node_type or "agentCard",
                    "is_official": False,
                    "drift_status": "custom",
                    "is_deleted": bool(setting.is_deleted),
                    "deleted_at": _iso(setting.deleted_at),
                }
            )
            processed_ids.add(setting_agent_id)

        payload = {
            "agents": final_agents,
            "has_drift": has_drift,
            "sentinel_online": len(sentinel_agents) > 0
        }
        if cache_service.enabled:
            cache_service.set(cache_key, payload, ttl=3)
        return payload
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"ERROR in list_agents for project {project_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list agents",
        )


@router.get("/projects/{project_id}/live-view/agents/{agent_id}/settings")
def get_agent_settings(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t0 = time.perf_counter()
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000
    if elapsed_ms > 1000:
        logger.info(
            "get_agent_settings slow: project_id=%s agent_id=%s elapsed_ms=%.0f",
            project_id, agent_id, elapsed_ms,
        )
    if not setting:
        return {
            "agent_id": agent_id,
            "display_name": None,
            "node_type": "agentCard",
            "is_deleted": False,
            "diagnostic_config": {},
        }
    return {
        "agent_id": agent_id,
        "display_name": setting.display_name,
        "node_type": setting.node_type,
        "is_deleted": setting.is_deleted,
        "diagnostic_config": setting.diagnostic_config or {},
    }


def _deep_merge_dict(base: dict, incoming: dict) -> dict:
    """
    Deep-merge `incoming` into `base` (dicts only).
    - Nested dicts are merged recursively.
    - Non-dict values in `incoming` replace `base`.
    """
    out = dict(base or {})
    for k, v in (incoming or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge_dict(out[k], v)
        else:
            out[k] = v
    return out


def _csv_has_items(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return any(part.strip() for part in value.split(","))


def _validate_eval_config_for_save(eval_part: Dict[str, Any]) -> None:
    normalized_eval = normalize_eval_config(eval_part)
    required_cfg = normalized_eval.get("required", {})
    if required_cfg.get("enabled"):
        has_required_input = _csv_has_items(required_cfg.get("keywords_csv")) or _csv_has_items(
            required_cfg.get("json_fields_csv")
        )
        if not has_required_input:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="When required is enabled, set keywords_csv or json_fields_csv.",
            )

    format_cfg = normalized_eval.get("format", {})
    if format_cfg.get("enabled") and not _csv_has_items(format_cfg.get("sections_csv")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="When format is enabled, set sections_csv.",
        )

    length_cfg = normalized_eval.get("length", {})
    if length_cfg.get("enabled"):
        warn_ratio = float(length_cfg.get("warn_ratio", 0.0))
        crit_ratio = float(length_cfg.get("crit_ratio", 0.0))
        if crit_ratio < warn_ratio:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="For length, crit_ratio must be greater than or equal to warn_ratio.",
            )

    repetition_cfg = normalized_eval.get("repetition", {})
    if repetition_cfg.get("enabled"):
        warn_repeats = int(repetition_cfg.get("warn_line_repeats", 0))
        crit_repeats = int(repetition_cfg.get("crit_line_repeats", 0))
        if crit_repeats < warn_repeats:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="For repetition, crit_line_repeats must be greater than or equal to warn_line_repeats.",
            )


@router.patch("/projects/{project_id}/live-view/agents/{agent_id}/settings")
def update_agent_settings(
    project_id: int,
    agent_id: str,
    display_name: Optional[str] = None,
    node_type: Optional[str] = None,
    is_deleted: Optional[bool] = None,
    diagnostic_config: Any = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    if diagnostic_config is not None and not isinstance(diagnostic_config, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="diagnostic_config must be a JSON object",
        )

    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if not setting:
        deleted_at = datetime.now(timezone.utc) if is_deleted else None
        setting = AgentDisplaySetting(
            id=str(uuid.uuid4()),
            project_id=project_id,
            system_prompt_hash=agent_id,
            display_name=display_name,
            node_type=node_type or "agentCard",
            is_deleted=is_deleted or False,
            deleted_at=deleted_at,
            diagnostic_config=diagnostic_config or {},
        )
        db.add(setting)
    else:
        if display_name is not None:
            setting.display_name = display_name
        if node_type is not None:
            setting.node_type = node_type
        if is_deleted is not None:
            setting.is_deleted = is_deleted
            setting.deleted_at = datetime.now(timezone.utc) if is_deleted else None
        if diagnostic_config is not None:
            # Deep-merge with existing config to avoid partial updates wiping nested objects.
            current_config = setting.diagnostic_config or {}
            setting.diagnostic_config = _deep_merge_dict(current_config, diagnostic_config)

    # Record eval config in history for both create + update flows.
    # This enables config-at-time evaluation in Clinical Log.
    if diagnostic_config is not None:
        merged = setting.diagnostic_config or {}
        eval_part = merged.get("eval") if isinstance(merged, dict) else None
        if isinstance(eval_part, dict):
            _validate_eval_config_for_save(eval_part)
            normalized_eval = normalize_eval_config(eval_part)
            history_row = AgentEvalConfigHistory(
                project_id=project_id,
                agent_id=agent_id,
                effective_from=datetime.now(timezone.utc),
                eval_config=normalized_eval,
            )
            db.add(history_row)
            
    db.commit()
    db.refresh(setting)
    return {
        "agent_id": agent_id, 
        "display_name": setting.display_name, 
        "is_deleted": setting.is_deleted,
        "diagnostic_config": setting.diagnostic_config
    }


@router.delete("/projects/{project_id}/live-view/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if setting:
        setting.is_deleted = True
        setting.deleted_at = datetime.now(timezone.utc)
    else:
        # So list_agents can exclude this agent via settings_map
        setting = AgentDisplaySetting(
            id=str(uuid.uuid4()),
            project_id=project_id,
            system_prompt_hash=agent_id,
            is_deleted=True,
            deleted_at=datetime.now(timezone.utc),
        )
        db.add(setting)
    db.commit()
    return None


@router.post(
    "/projects/{project_id}/live-view/agents/hard-delete",
    status_code=status.HTTP_200_OK,
)
def hard_delete_agents(
    project_id: int,
    payload: AgentHardDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permanently delete soft-deleted agent display settings for the given project.

    This is a targeted hard-delete that bypasses the scheduled lifecycle cleanup
    for agents selected by the user in the Live View "Deleted Nodes" tray.
    """
    _ensure_project_admin(project_id, current_user, db)

    normalized_ids = [str(a or "").strip() for a in payload.agent_ids]
    normalized_ids = [a for a in normalized_ids if a]
    if not normalized_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid agent_ids provided",
        )

    settings_q = (
        db.query(AgentDisplaySetting)
        .filter(
            AgentDisplaySetting.project_id == project_id,
            AgentDisplaySetting.system_prompt_hash.in_(normalized_ids),
        )
    )
    deleted_count = settings_q.count()
    if deleted_count:
        settings_q.delete(synchronize_session=False)
        db.commit()

    return {"ok": True, "deleted_agent_settings": deleted_count}


@router.post("/projects/{project_id}/live-view/agents/{agent_id}/restore", status_code=status.HTTP_200_OK)
def restore_agent(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    restored = restore_agent_if_soft_deleted(db, project_id, agent_id, now=datetime.now(timezone.utc))
    if not restored:
        setting = (
            db.query(AgentDisplaySetting)
            .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
            .first()
        )
        if setting is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        setting.is_deleted = False
        setting.deleted_at = None
    db.commit()
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    return {
        "agent_id": agent_id,
        "display_name": setting.display_name if setting else None,
        "is_deleted": setting.is_deleted if setting else False,
        "diagnostic_config": setting.diagnostic_config if setting else {},
    }


@router.get("/projects/{project_id}/live-view/agents/{agent_id}/saved-logs")
def list_saved_logs(
    project_id: int,
    agent_id: str,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)

    total = (
        db.query(func.count(SavedLog.id))
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
        )
        .scalar()
        or 0
    )

    rows = (
        db.query(SavedLog, Snapshot)
        .join(Snapshot, Snapshot.id == SavedLog.snapshot_id)
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
            Snapshot.project_id == project_id,
            Snapshot.agent_id == agent_id,
            Snapshot.is_deleted.is_(False),
        )
        .order_by(SavedLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = []
    for saved, snap in rows:
        items.append(
            {
                "id": saved.id,
                "snapshot_id": snap.id,
                "trace_id": snap.trace_id,
                "agent_id": snap.agent_id,
                "provider": snap.provider,
                "model": snap.model,
                "status_code": snap.status_code,
                "latency_ms": snap.latency_ms,
                "eval_checks_result": getattr(snap, "eval_checks_result", None),
                "snapshot_created_at": snap.created_at.isoformat() if snap.created_at else None,
                "saved_at": saved.created_at.isoformat() if saved.created_at else None,
            }
        )

    return {"items": items, "total": int(total), "limit": limit, "offset": offset}


@router.post("/projects/{project_id}/live-view/agents/{agent_id}/saved-logs")
def save_logs_for_agent(
    project_id: int,
    agent_id: str,
    body: SaveLogsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    requested_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not requested_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="snapshot_ids is required")

    rows = (
        db.query(Snapshot.id, Snapshot.agent_id)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(requested_ids),
            Snapshot.is_deleted.is_(False),
        )
        .all()
    )
    existing_by_id = {int(row.id): str(row.agent_id or "") for row in rows if row.id is not None}
    missing_snapshot_ids = [sid for sid in requested_ids if sid not in existing_by_id]
    mismatched_snapshot_ids = [sid for sid in requested_ids if sid in existing_by_id and existing_by_id[sid] != agent_id]
    valid_snapshot_ids = [sid for sid in requested_ids if sid in existing_by_id and existing_by_id[sid] == agent_id]

    if not valid_snapshot_ids:
        return {
            "ok": True,
            "saved_count": 0,
            "already_saved_count": 0,
            "missing_snapshot_ids": missing_snapshot_ids,
            "mismatched_snapshot_ids": mismatched_snapshot_ids,
        }

    existing_saved_ids = {
        int(row.snapshot_id)
        for row in db.query(SavedLog.snapshot_id)
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
            SavedLog.snapshot_id.in_(valid_snapshot_ids),
        )
        .all()
    }
    to_create_ids = [sid for sid in valid_snapshot_ids if sid not in existing_saved_ids]
    for sid in to_create_ids:
        db.add(SavedLog(project_id=project_id, agent_id=agent_id, snapshot_id=sid))
    if to_create_ids:
        db.commit()

    return {
        "ok": True,
        "saved_count": len(to_create_ids),
        "already_saved_count": len(valid_snapshot_ids) - len(to_create_ids),
        "missing_snapshot_ids": missing_snapshot_ids,
        "mismatched_snapshot_ids": mismatched_snapshot_ids,
    }


@router.post("/projects/{project_id}/live-view/agents/{agent_id}/saved-logs/batch-delete")
def delete_saved_logs_batch(
    project_id: int,
    agent_id: str,
    body: DeleteSavedLogsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    target_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not target_ids:
        return {"ok": True, "deleted": 0}

    deleted = (
        db.query(SavedLog)
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
            SavedLog.snapshot_id.in_(target_ids),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": int(deleted or 0)}


@router.delete("/projects/{project_id}/live-view/agents/{agent_id}/saved-logs")
def clear_saved_logs(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    deleted = (
        db.query(SavedLog)
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": int(deleted or 0)}


def _run_policy_validation_background(project_id: int, trace_id: str) -> None:
    """Run policy (tool use) validation for a trace in background after snapshot save. Fail-silent."""
    import time
    # Brief delay so snapshots written to Redis stream have time to be flushed to DB by stream_processor
    time.sleep(2)
    from app.api.v1.endpoints.behavior import run_behavior_validation_for_trace
    db = SessionLocal()
    try:
        run_behavior_validation_for_trace(project_id, trace_id, db)
    except Exception as e:
        logger.warning("Policy validation after snapshot save failed: %s", e)
    finally:
        db.close()


@router.post("/projects/{project_id}/snapshots")
async def create_snapshot(
    project_id: int,
    background_tasks: BackgroundTasks,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    snapshot_service = Depends(get_snapshot_service),
):
    """
    Manually ingest a snapshot for Live View (Simulation/SDK support).

    Expected payload: {
        "trace_id": str,
        "agent_id": str (optional),
        "provider": str,
        "model": str,
        "payload": { ...LLM payload... },
        "status_code": int (optional, default 200)
    }

    For tool-call visibility (badge and policy checks): include in "payload" either
    a "response" object containing "tool_calls", or a top-level "tool_calls" array.
    Same shape as Proxy (e.g. response.choices[0].message.tool_calls) is supported.

    Responses:
    - 200 OK: Snapshot saved synchronously (no Redis or Redis unavailable). Body: { id, passed, violations }.
    - 202 Accepted: Snapshot queued for processing (Redis stream). Body: { status: "accepted", message: "..." }.
      The snapshot will appear in list/get after the background worker flushes (typically within a few seconds).
    - 500: Save failed (e.g. queue failed, or sync save error).
    """
    project = _ensure_project(project_id, current_user, db)
    allowed, err_msg = check_snapshot_limit(db, project.owner_id, getattr(current_user, "is_superuser", False))
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "SNAPSHOT_PLAN_LIMIT_REACHED",
                "message": err_msg or "You have reached the monthly snapshot limit for your plan.",
                "details": {
                    "upgrade_path": "/settings/subscription",
                },
            },
        )

    trace_id = payload.get("trace_id")
    provider = payload.get("provider", "unknown")
    model = payload.get("model", "unknown")
    snapshot_payload = payload.get("payload", {})
    agent_id = payload.get("agent_id")
    status_code = payload.get("status_code", 200)

    # Use service to save snapshot (which also triggers signal evaluation)
    snapshot = snapshot_service.save_snapshot(
        trace_id=trace_id,
        provider=provider,
        model=model,
        payload=snapshot_payload,
        status_code=status_code,
        project_id=project_id,
    )
    
    if not snapshot:
        # Queued to Redis stream; acknowledge with 202 so clients do not retry
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                "status": "accepted",
                "message": "Snapshot queued for processing. It will appear in the list shortly.",
            },
        )

    # Update agent_id if explicitly provided in wrapper
    if agent_id:
        snapshot.agent_id = agent_id
        restore_agent_if_soft_deleted(db, project_id, agent_id, now=datetime.now(timezone.utc))
        db.commit()

    # Run policy (tool use) validation asynchronously so Clinical Log shows result without Run check
    if trace_id:
        background_tasks.add_task(_run_policy_validation_background, project_id, trace_id)

    return {
        "id": snapshot.id,
        "passed": snapshot.evaluation_result.get("passed", True) if snapshot.evaluation_result else True,
        "violations": snapshot.evaluation_result.get("violations", []) if snapshot.evaluation_result else []
    }


@router.get("/projects/{project_id}/snapshots")
def list_snapshots(
    project_id: int,
    agent_id: Optional[str] = None,
    is_worst: Optional[bool] = None,
    light: bool = Query(False, description="If true, omit payload and long text fields for faster list loading"),
    limit: int = Query(50, ge=1, le=400),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Snapshot list with filters for Live View.
    Use light=true for list view; open detail with GET /snapshots/{id} for full payload.
    """
    _ensure_project(project_id, current_user, db)
    query = db.query(Snapshot).filter(Snapshot.project_id == project_id, Snapshot.is_deleted.is_(False))
    if agent_id:
        query = query.filter(Snapshot.agent_id == agent_id)
    if is_worst is not None:
        query = query.filter(Snapshot.is_worst == is_worst)

    total_count = query.count()
    items = query.order_by(Snapshot.created_at.desc()).offset(offset).limit(limit).all()

    def _tool_fields(snap, skip_payload: bool = False):
        summary = getattr(snap, "tool_calls_summary", None)
        if summary is None and not skip_payload and getattr(snap, "payload", None):
            summary = extract_tool_calls_summary(snap.payload)
        return {
            "has_tool_calls": bool(summary),
            "tool_calls_summary": summary or [],
        }

    def _item(s):
        base = {
            "id": s.id,
            "trace_id": s.trace_id,
            "agent_id": s.agent_id,
            "provider": s.provider,
            "model": s.model,
            "model_settings": s.model_settings,
            "latency_ms": s.latency_ms,
            "tokens_used": s.tokens_used,
            "cost": s.cost,
            "status_code": s.status_code,
            "is_worst": s.is_worst,
            "worst_status": s.worst_status,
            "is_golden": s.is_golden,
            "signal_result": s.signal_result,
            "evaluation_result": s.evaluation_result,
            "eval_checks_result": getattr(s, "eval_checks_result", None),
            "eval_config_version": getattr(s, "eval_config_version", None),
            "created_at": s.created_at,
            **_tool_fields(s, skip_payload=light),
        }
        if light:
            base["system_prompt"] = None
            base["user_message"] = None
            base["response"] = None
            base["request_prompt"] = None
            base["response_text"] = None
            base["payload"] = None
        else:
            base["system_prompt"] = s.system_prompt
            base["user_message"] = s.user_message
            base["response"] = s.response
            base["request_prompt"] = s.user_message
            base["response_text"] = s.response
            base["payload"] = s.payload
        return base

    return {
        "items": [_item(s) for s in items],
        "count": len(items),
        "total_count": int(total_count),
        "limit": limit,
        "offset": offset,
    }


@router.get("/projects/{project_id}/snapshots/{snapshot_id}")
def get_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a single snapshot by id with full fields (for detail modal)."""
    _ensure_project(project_id, current_user, db)
    snap = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id == snapshot_id,
            Snapshot.is_deleted.is_(False),
        )
        .first()
    )
    if not snap:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    summary = getattr(snap, "tool_calls_summary", None)
    if summary is None and snap.payload:
        summary = extract_tool_calls_summary(snap.payload)
    created_at = getattr(snap, "created_at", None)
    return {
        "id": snap.id,
        "trace_id": snap.trace_id,
        "agent_id": snap.agent_id,
        "provider": snap.provider,
        "model": snap.model,
        "model_settings": snap.model_settings,
        "system_prompt": snap.system_prompt,
        "user_message": snap.user_message,
        "response": snap.response,
        "request_prompt": snap.user_message,
        "response_text": snap.response,
        "latency_ms": snap.latency_ms,
        "tokens_used": snap.tokens_used,
        "cost": snap.cost,
        "status_code": snap.status_code,
        "is_worst": snap.is_worst,
        "worst_status": snap.worst_status,
        "is_golden": snap.is_golden,
        "signal_result": snap.signal_result,
        "evaluation_result": snap.evaluation_result,
        "eval_checks_result": getattr(snap, "eval_checks_result", None),
        "eval_config_version": getattr(snap, "eval_config_version", None),
        "payload": snap.payload,
        "created_at": created_at.isoformat() if created_at else None,
        "has_tool_calls": bool(summary),
        "tool_calls_summary": summary or [],
    }


@router.get("/projects/{project_id}/snapshots/deleted")
def list_deleted_snapshots(
    project_id: int,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.is_deleted.is_(True),
            Snapshot.deleted_at.isnot(None),
            Snapshot.deleted_at >= cutoff,
        )
    )
    total_count = query.count()
    items = (
        query.order_by(Snapshot.deleted_at.desc(), Snapshot.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": s.id,
                "trace_id": s.trace_id,
                "agent_id": s.agent_id,
                "model": s.model,
                "status_code": s.status_code,
                "created_at": s.created_at,
                "deleted_at": s.deleted_at,
            }
            for s in items
        ],
        "count": len(items),
        "total_count": int(total_count),
        "limit": limit,
        "offset": offset,
        "window_days": days,
    }


@router.delete("/projects/{project_id}/snapshots/{snapshot_id}")
def delete_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id == snapshot_id,
            Snapshot.is_deleted.is_(False),
        )
        .first()
    )
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")

    now_utc = datetime.now(timezone.utc)
    snapshot.is_deleted = True
    snapshot.deleted_at = now_utc
    db.query(SavedLog).filter(
        SavedLog.project_id == project_id,
        SavedLog.snapshot_id == snapshot_id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": 1}


@router.post("/projects/{project_id}/snapshots/batch-delete")
def batch_delete_snapshots(
    project_id: int,
    body: SnapshotBatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not snapshot_ids:
        return {"ok": True, "deleted": 0}

    rows = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(snapshot_ids),
            Snapshot.is_deleted.is_(False),
        )
        .all()
    )
    if not rows:
        return {"ok": True, "deleted": 0}

    now_utc = datetime.now(timezone.utc)
    matched_ids = [int(row.id) for row in rows]
    (
        db.query(Snapshot)
        .filter(Snapshot.project_id == project_id, Snapshot.id.in_(matched_ids))
        .update(
            {"is_deleted": True, "deleted_at": now_utc},
            synchronize_session=False,
        )
    )
    (
        db.query(SavedLog)
        .filter(SavedLog.project_id == project_id, SavedLog.snapshot_id.in_(matched_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": len(matched_ids)}


@router.post("/projects/{project_id}/snapshots/{snapshot_id}/restore")
def restore_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id == snapshot_id,
            Snapshot.is_deleted.is_(True),
        )
        .first()
    )
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deleted snapshot not found")

    snapshot.is_deleted = False
    snapshot.deleted_at = None
    db.commit()
    return {"ok": True, "restored": 1}


@router.post("/projects/{project_id}/snapshots/deleted/batch-restore")
def restore_snapshots_batch(
    project_id: int,
    body: SnapshotBatchActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not snapshot_ids:
        return {"ok": True, "restored": 0}
    restored = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(snapshot_ids),
            Snapshot.is_deleted.is_(True),
        )
        .update({"is_deleted": False, "deleted_at": None}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "restored": int(restored or 0)}


@router.post("/projects/{project_id}/snapshots/deleted/permanent-delete")
def permanently_delete_snapshots(
    project_id: int,
    body: SnapshotBatchActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not snapshot_ids:
        return {"ok": True, "deleted": 0}
    deleted = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(snapshot_ids),
            Snapshot.is_deleted.is_(True),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": int(deleted or 0)}


def _parse_created_at(created_at: Any) -> Optional[datetime]:
    """Parse snapshot created_at (ISO string or datetime) to timezone-aware datetime for comparison."""
    if created_at is None:
        return None
    if isinstance(created_at, datetime):
        return created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    if isinstance(created_at, str):
        s = created_at.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


@router.get("/projects/{project_id}/live-view/agents/{agent_id}/evaluation")
def evaluate_agent_with_eval_config(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluate recent snapshots for an agent. Each snapshot is evaluated with the eval config
    that was active at that snapshot's created_at (config-at-time): logs before a config
    change use the old config, logs after use the new one.
    """
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    diagnostic_config = setting.diagnostic_config if setting and isinstance(setting.diagnostic_config, dict) else {}
    current_eval = diagnostic_config.get("eval", {}) if isinstance(diagnostic_config, dict) else {}

    history_rows = (
        db.query(AgentEvalConfigHistory)
        .filter(
            AgentEvalConfigHistory.project_id == project_id,
            AgentEvalConfigHistory.agent_id == agent_id,
        )
        .order_by(AgentEvalConfigHistory.effective_from.desc())
        .all()
    )

    def get_config_at(created_at: Any) -> Dict[str, Any]:
        ts = _parse_created_at(created_at)
        if ts is None:
            return current_eval
        for row in history_rows:
            eff = row.effective_from
            if eff is None:
                continue
            if getattr(eff, "tzinfo", None) is None:
                eff = eff.replace(tzinfo=timezone.utc)
            if eff <= ts:
                return row.eval_config or current_eval
        return current_eval

    # Load recent snapshots; if all have stored eval_checks_result, use them (stable display).
    window_limit = normalize_eval_config(current_eval)["window"]["limit"]
    rows = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id == agent_id,
            Snapshot.is_deleted.is_(False),
        )
        .order_by(Snapshot.created_at.desc())
        .limit(window_limit)
        .all()
    )
    rows.reverse()
    all_have_stored = all(getattr(s, "eval_checks_result", None) for s in rows)
    if rows and all_have_stored:
        out = aggregate_stored_eval_checks(rows, agent_id, current_eval)
    elif not history_rows:
        out = evaluate_recent_snapshots(db, project_id, agent_id, current_eval)
    else:
        out = evaluate_recent_snapshots(db, project_id, agent_id, current_eval, get_config_at=get_config_at)
    out["current_eval_config_version"] = eval_config_version_hash(current_eval)
    return out
