from __future__ import annotations

import json
from typing import Iterable, Optional

from app.core.logging_config import logger
from app.services.cache_service import cache_service

LIVE_VIEW_AGENT_LIST_INVALIDATION_COALESCE_SEC = 5


def _coalesce_agent_list_cache_invalidation(project_id: int) -> None:
    """
    Avoid deleting hot list caches on every single snapshot burst.

    This keeps Live View / Release Gate agent-list caches reusable for a few
    seconds under sustained write traffic while SSE still notifies dashboards
    immediately that something changed.
    """
    if not cache_service.enabled:
        return
    try:
        guard_key = f"project:{int(project_id)}:live_view:agent_lists:invalidate_guard"
        should_invalidate = cache_service.redis_client.set(
            guard_key,
            "1",
            ex=LIVE_VIEW_AGENT_LIST_INVALIDATION_COALESCE_SEC,
            nx=True,
        )
        if not should_invalidate:
            return
        cache_service.delete_pattern(f"project:{int(project_id)}:live_view:agents:*")
        cache_service.delete_pattern(f"project:{int(project_id)}:release_gate:agents:*")
    except Exception as exc:
        logger.debug(
            "coalesced agent-list cache invalidation failed",
            extra={"project_id": project_id, "error": str(exc)},
        )


def publish_agents_changed(project_id: int, agent_ids: Optional[Iterable[str]] = None) -> None:
    """
    Publish a lightweight Live View event to notify dashboards to refresh agent lists.

    v0 payload: { type: "agents_changed", project_id, agent_ids?: [...] }
    """
    if not cache_service.enabled:
        return
    try:
        _coalesce_agent_list_cache_invalidation(project_id)
        channel = f"project:{int(project_id)}:live_view:events"
        payload = {
            "type": "agents_changed",
            "project_id": int(project_id),
        }
        if agent_ids:
            uniq = []
            seen = set()
            for a in agent_ids:
                s = str(a or "").strip()
                if not s or s in seen:
                    continue
                seen.add(s)
                uniq.append(s)
            if uniq:
                payload["agent_ids"] = uniq
        cache_service.redis_client.publish(channel, json.dumps(payload))
    except Exception as exc:
        logger.debug("publish_agents_changed failed", extra={"project_id": project_id, "error": str(exc)})

