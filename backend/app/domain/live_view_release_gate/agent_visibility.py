from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_config import logger
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.project import Project
from app.services.cache_service import cache_service

# Invalidated on settings/canvas changes; longer TTL cuts herd rebuilds under sustained load.
AGENT_VISIBILITY_CACHE_TTL_SEC = 45


@dataclass
class AgentVisibilitySetting:
    system_prompt_hash: str
    display_name: Optional[str]
    node_type: Optional[str]
    is_deleted: bool
    deleted_at: Optional[datetime]


@dataclass
class _AgentVisibilityStaticContext:
    blueprint_map: Dict[str, dict]
    sentinel_agents: List[dict]
    has_drift: bool
    settings_map: Dict[str, AgentVisibilitySetting]


@dataclass
class AgentVisibilityContext:
    project: Project
    blueprint_map: Dict[str, dict]
    sentinel_agents: List[dict]
    has_drift: bool
    settings_map: Dict[str, AgentVisibilitySetting]
    all_agent_ids: Set[str]


def _visibility_cache_key(project_id: int) -> str:
    return f"project:{int(project_id)}:agent_visibility:v1"


def invalidate_agent_visibility_cache(project_id: int) -> None:
    if not cache_service.enabled:
        return
    try:
        cache_service.delete(_visibility_cache_key(project_id))
    except Exception:
        pass


def _parse_cached_datetime(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _build_blueprint_map(project: Project) -> Dict[str, dict]:
    blueprint_nodes = getattr(project, "canvas_nodes", None) or []
    blueprint_map: Dict[str, dict] = {}
    for raw_node in blueprint_nodes:
        if not isinstance(raw_node, dict):
            continue
        node_id = str(raw_node.get("id") or "").strip()
        if not node_id:
            continue
        raw_data = raw_node.get("data")
        data = raw_data if isinstance(raw_data, dict) else {}
        blueprint_map[node_id] = {
            "id": node_id,
            "type": raw_node.get("type"),
            "data": {
                "label": data.get("label"),
                "model": data.get("model"),
            },
        }
    return blueprint_map


def _load_sentinel_agents(project_id: int) -> tuple[List[dict], bool]:
    sentinel_agents: List[dict] = []
    has_drift = False
    if not cache_service.enabled:
        return sentinel_agents, has_drift
    report_key = f"project:{project_id}:sentinel:latest"
    try:
        cached_report = cache_service.redis_client.get(report_key)
        if not cached_report:
            return sentinel_agents, has_drift
        report_data = json.loads(cached_report)
        if not isinstance(report_data, dict):
            return sentinel_agents, has_drift
        raw_nodes = report_data.get("nodes", [])
        if isinstance(raw_nodes, list):
            for raw_node in raw_nodes:
                if not isinstance(raw_node, dict):
                    continue
                node_id = str(raw_node.get("id") or "").strip()
                if not node_id:
                    continue
                sentinel_agents.append(
                    {
                        "id": node_id,
                        "model": raw_node.get("model"),
                    }
                )
        has_drift = bool(report_data.get("has_drift", False))
    except Exception as exc:
        logger.debug(
            "build_agent_visibility_context: sentinel cache decode failed",
            extra={"project_id": project_id, "error": str(exc)},
        )
    return sentinel_agents, has_drift


def _load_settings_map(db: Session, project_id: int) -> Dict[str, AgentVisibilitySetting]:
    rows = (
        db.query(
            AgentDisplaySetting.system_prompt_hash,
            AgentDisplaySetting.display_name,
            AgentDisplaySetting.node_type,
            AgentDisplaySetting.is_deleted,
            AgentDisplaySetting.deleted_at,
        )
        .filter(AgentDisplaySetting.project_id == project_id)
        .all()
    )
    settings_map: Dict[str, AgentVisibilitySetting] = {}
    for row in rows:
        key = str(row.system_prompt_hash or "").strip()
        if not key:
            continue
        settings_map[key] = AgentVisibilitySetting(
            system_prompt_hash=key,
            display_name=row.display_name,
            node_type=row.node_type,
            is_deleted=bool(row.is_deleted),
            deleted_at=row.deleted_at,
        )
    return settings_map


def _serialize_static_context(ctx: _AgentVisibilityStaticContext) -> dict:
    return {
        "blueprint_map": ctx.blueprint_map,
        "sentinel_agents": ctx.sentinel_agents,
        "has_drift": ctx.has_drift,
        "settings": [
            {
                "system_prompt_hash": setting.system_prompt_hash,
                "display_name": setting.display_name,
                "node_type": setting.node_type,
                "is_deleted": setting.is_deleted,
                "deleted_at": setting.deleted_at.isoformat() if setting.deleted_at else None,
            }
            for setting in ctx.settings_map.values()
        ],
    }


def _deserialize_static_context(payload: Any) -> Optional[_AgentVisibilityStaticContext]:
    if not isinstance(payload, dict):
        return None
    blueprint_map = payload.get("blueprint_map")
    sentinel_agents = payload.get("sentinel_agents")
    if not isinstance(blueprint_map, dict) or not isinstance(sentinel_agents, list):
        return None
    settings_map: Dict[str, AgentVisibilitySetting] = {}
    raw_settings = payload.get("settings")
    if isinstance(raw_settings, list):
        for raw_setting in raw_settings:
            if not isinstance(raw_setting, dict):
                continue
            key = str(raw_setting.get("system_prompt_hash") or "").strip()
            if not key:
                continue
            settings_map[key] = AgentVisibilitySetting(
                system_prompt_hash=key,
                display_name=raw_setting.get("display_name"),
                node_type=raw_setting.get("node_type"),
                is_deleted=bool(raw_setting.get("is_deleted")),
                deleted_at=_parse_cached_datetime(raw_setting.get("deleted_at")),
            )
    return _AgentVisibilityStaticContext(
        blueprint_map=blueprint_map,
        sentinel_agents=[node for node in sentinel_agents if isinstance(node, dict)],
        has_drift=bool(payload.get("has_drift", False)),
        settings_map=settings_map,
    )


def _load_static_context(
    project_id: int,
    db: Session,
    project: Project,
) -> _AgentVisibilityStaticContext:
    if cache_service.enabled:
        cached = _deserialize_static_context(cache_service.get(_visibility_cache_key(project_id)))
        if cached is not None:
            return cached

    static_ctx = _AgentVisibilityStaticContext(
        blueprint_map=_build_blueprint_map(project),
        sentinel_agents=[],
        has_drift=False,
        settings_map=_load_settings_map(db, project_id),
    )
    static_ctx.sentinel_agents, static_ctx.has_drift = _load_sentinel_agents(project_id)

    if cache_service.enabled:
        cache_service.set(
            _visibility_cache_key(project_id),
            _serialize_static_context(static_ctx),
            ttl=AGENT_VISIBILITY_CACHE_TTL_SEC,
        )
    return static_ctx


def build_agent_visibility_context(
    project_id: int,
    db: Session,
    seed_agent_ids: Optional[Iterable[str]] = None,
    project: Optional[Project] = None,
) -> AgentVisibilityContext:
    """
    Build a shared visibility context for Live View and Release Gate.

    Visibility sources:
    1) snapshot-derived agent ids (seed_agent_ids)
    2) blueprint nodes (project.canvas_nodes)
    3) sentinel nodes (cached report)
    """
    if project is None:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project is None:
            raise ValueError(f"Project not found for visibility context: {project_id}")

    static_ctx = _load_static_context(project_id=project_id, db=db, project=project)

    normalized_seed_ids: Set[str] = set()
    for raw in seed_agent_ids or []:
        val = str(raw or "").strip()
        if val:
            normalized_seed_ids.add(val)

    sentinel_ids = {
        str(n.get("id")).strip()
        for n in static_ctx.sentinel_agents
        if isinstance(n, dict) and n.get("id") and str(n.get("id")).strip()
    }
    setting_agent_ids = set(static_ctx.settings_map.keys())

    all_agent_ids = normalized_seed_ids | set(static_ctx.blueprint_map.keys()) | sentinel_ids | setting_agent_ids

    return AgentVisibilityContext(
        project=project,
        blueprint_map=static_ctx.blueprint_map,
        sentinel_agents=static_ctx.sentinel_agents,
        has_drift=static_ctx.has_drift,
        settings_map=static_ctx.settings_map,
        all_agent_ids=all_agent_ids,
    )


def _get_agent_setting(
    settings_map: Dict[str, AgentVisibilitySetting], agent_id: Optional[str]
) -> Optional[AgentVisibilitySetting]:
    key = str(agent_id or "").strip()
    if not key:
        return None
    return settings_map.get(key)


def is_agent_soft_deleted(settings_map: Dict[str, AgentVisibilitySetting], agent_id: Optional[str]) -> bool:
    setting = _get_agent_setting(settings_map, agent_id)
    return bool(setting is not None and setting.is_deleted)


def is_agent_hard_deleted(settings_map: Dict[str, AgentVisibilitySetting], agent_id: Optional[str]) -> bool:
    setting = _get_agent_setting(settings_map, agent_id)
    return bool(setting is not None and not setting.is_deleted and setting.deleted_at is not None)


def is_agent_hidden(settings_map: Dict[str, AgentVisibilitySetting], agent_id: Optional[str]) -> bool:
    return is_agent_soft_deleted(settings_map, agent_id) or is_agent_hard_deleted(
        settings_map, agent_id
    )


def is_agent_deleted(settings_map: Dict[str, AgentVisibilitySetting], agent_id: Optional[str]) -> bool:
    """Backward-compatible alias for callers that only need hidden/not-hidden semantics."""
    return is_agent_hidden(settings_map, agent_id)


def restore_agent_if_soft_deleted(
    db: Session,
    project_id: Optional[int],
    agent_id: Optional[str],
    now: Optional[datetime] = None,
) -> bool:
    """Restore a hidden agent when matching traffic reappears."""
    normalized_agent_id = str(agent_id or "").strip()
    if not project_id or not normalized_agent_id:
        return False

    setting = (
        db.query(AgentDisplaySetting)
        .filter(
            AgentDisplaySetting.project_id == project_id,
            AgentDisplaySetting.system_prompt_hash == normalized_agent_id,
        )
        .first()
    )
    if setting is None:
        return False
    if not setting.is_deleted:
        if setting.deleted_at is None:
            return False
        setting.deleted_at = None
        invalidate_agent_visibility_cache(project_id)
        return True

    deleted_at = setting.deleted_at
    restore_window_days = max(int(settings.AGENT_AUTO_RESTORE_DAYS or 0), 0)
    if deleted_at is not None and restore_window_days > 0:
        reference_now = now or datetime.now(timezone.utc)
        if deleted_at.tzinfo is None and reference_now.tzinfo is not None:
            reference_now = reference_now.replace(tzinfo=None)
        elif deleted_at.tzinfo is not None and reference_now.tzinfo is None:
            reference_now = reference_now.replace(tzinfo=deleted_at.tzinfo)
        cutoff = reference_now - timedelta(days=restore_window_days)
        if deleted_at < cutoff:
            return False

    setting.is_deleted = False
    setting.deleted_at = None
    invalidate_agent_visibility_cache(project_id)
    return True

