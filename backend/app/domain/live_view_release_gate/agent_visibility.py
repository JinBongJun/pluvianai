from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Set

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_config import logger
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.project import Project
from app.services.cache_service import cache_service


@dataclass
class AgentVisibilityContext:
    project: Project
    blueprint_map: Dict[str, dict]
    sentinel_agents: List[dict]
    has_drift: bool
    settings_map: Dict[str, AgentDisplaySetting]
    all_agent_ids: Set[str]


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

    blueprint_nodes = project.canvas_nodes or []
    blueprint_map = {n.get("id"): n for n in blueprint_nodes if isinstance(n, dict) and n.get("id")}

    sentinel_agents: List[dict] = []
    has_drift = False
    if cache_service.enabled:
        report_key = f"project:{project_id}:sentinel:latest"
        try:
            cached_report = cache_service.redis_client.get(report_key)
            if cached_report:
                report_data = json.loads(cached_report)
                sentinel_agents = report_data.get("nodes", []) if isinstance(report_data, dict) else []
                has_drift = bool(report_data.get("has_drift", False)) if isinstance(report_data, dict) else False
        except Exception as exc:
            logger.debug(
                "build_agent_visibility_context: sentinel cache decode failed",
                extra={"project_id": project_id, "error": str(exc)},
            )

    normalized_seed_ids: Set[str] = set()
    for raw in seed_agent_ids or []:
        val = str(raw or "").strip()
        if val:
            normalized_seed_ids.add(val)

    sentinel_ids = {
        str(n.get("id")).strip()
        for n in sentinel_agents
        if isinstance(n, dict) and n.get("id") and str(n.get("id")).strip()
    }
    settings = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id)
        .all()
    )
    settings_map: Dict[str, AgentDisplaySetting] = {}
    setting_agent_ids: Set[str] = set()
    for setting in settings:
        key = str(setting.system_prompt_hash or "").strip()
        if not key:
            continue
        settings_map[key] = setting
        setting_agent_ids.add(key)

    all_agent_ids = normalized_seed_ids | set(blueprint_map.keys()) | sentinel_ids | setting_agent_ids

    return AgentVisibilityContext(
        project=project,
        blueprint_map=blueprint_map,
        sentinel_agents=sentinel_agents,
        has_drift=has_drift,
        settings_map=settings_map,
        all_agent_ids=all_agent_ids,
    )


def is_agent_deleted(settings_map: Dict[str, AgentDisplaySetting], agent_id: Optional[str]) -> bool:
    key = str(agent_id or "").strip()
    if not key:
        return False
    setting = settings_map.get(key)
    return bool(setting is not None and setting.is_deleted)


def restore_agent_if_soft_deleted(
    db: Session,
    project_id: Optional[int],
    agent_id: Optional[str],
    now: Optional[datetime] = None,
) -> bool:
    """Restore a recently deleted agent when identical traffic reappears."""
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
    if setting is None or not setting.is_deleted:
        return False

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
    return True

