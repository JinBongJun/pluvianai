from __future__ import annotations

import json
from typing import Iterable, Optional

from app.core.logging_config import logger
from app.services.cache_service import cache_service

LIVE_VIEW_EVENT_DEBOUNCE_SEC = 2


def _event_throttle_key(project_id: int) -> str:
    return f"project:{int(project_id)}:live_view:agents_changed:cooldown"


def publish_agents_changed(
    project_id: int,
    agent_ids: Optional[Iterable[str]] = None,
    *,
    force_refresh: bool = False,
) -> None:
    """
    Publish a lightweight Live View event to notify dashboards to refresh agent lists.

    v0 payload: { type: "agents_changed", project_id, agent_ids?: [...] }
    """
    if not cache_service.enabled:
        return
    try:
        should_publish = force_refresh
        if not should_publish:
            # Coalesce high-frequency ingest writes so dashboards do not force a full
            # cache rebuild for every single snapshot.
            should_publish = bool(
                cache_service.redis_client.set(
                    _event_throttle_key(project_id),
                    "1",
                    ex=LIVE_VIEW_EVENT_DEBOUNCE_SEC,
                    nx=True,
                )
            )
        if not should_publish:
            return

        cache_service.delete_pattern(f"project:{int(project_id)}:live_view:agents:*")
        cache_service.delete_pattern(f"project:{int(project_id)}:release_gate:agents:*")
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

