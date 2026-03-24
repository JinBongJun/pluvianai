from __future__ import annotations

import json
from typing import Iterable, Optional

from app.core.logging_config import logger
from app.services.cache_service import cache_service


def publish_agents_changed(project_id: int, agent_ids: Optional[Iterable[str]] = None) -> None:
    """
    Publish a lightweight Live View event to notify dashboards to refresh agent lists.

    v0 payload: { type: "agents_changed", project_id, agent_ids?: [...] }
    """
    if not cache_service.enabled:
        return
    try:
        cache_service.delete_pattern(f"project:{int(project_id)}:live_view:agents:v2:*")
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

