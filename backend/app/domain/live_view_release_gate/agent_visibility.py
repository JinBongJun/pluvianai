from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Set

from sqlalchemy.orm import Session

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
    all_agent_ids = normalized_seed_ids | set(blueprint_map.keys()) | sentinel_ids

    settings_map: Dict[str, AgentDisplaySetting] = {}
    if all_agent_ids:
        settings = (
            db.query(AgentDisplaySetting)
            .filter(
                AgentDisplaySetting.project_id == project_id,
                AgentDisplaySetting.system_prompt_hash.in_(all_agent_ids),
            )
            .all()
        )
        settings_map = {s.system_prompt_hash: s for s in settings}

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

