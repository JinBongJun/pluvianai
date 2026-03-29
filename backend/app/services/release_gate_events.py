from __future__ import annotations

import json
from typing import Any, Dict

from app.core.logging_config import logger
from app.services.cache_service import cache_service

RELEASE_GATE_STATUS_CACHE_TTL_SEC = 600


def release_gate_job_events_channel(project_id: int, job_id: str) -> str:
    return f"project:{int(project_id)}:release_gate:job:{str(job_id)}:events"


def release_gate_job_status_cache_key(project_id: int, job_id: str) -> str:
    return f"project:{int(project_id)}:release_gate:job:{str(job_id)}:status"


def invalidate_release_gate_job_poll_cache(project_id: int, job_id: str) -> None:
    if not cache_service.enabled:
        return
    cache_service.delete_pattern(f"project:{int(project_id)}:release_gate:job:{str(job_id)}:include_result:*")


def publish_release_gate_job_updated(
    project_id: int,
    job_id: str,
    job_payload: Dict[str, Any],
    *,
    event_type: str = "job_updated",
) -> None:
    """
    Publish a lightweight Release Gate job update for SSE subscribers.

    Payload shape:
    {
      "type": "job_updated",
      "project_id": 123,
      "job_id": "uuid",
      "job": { ...thin serialized job payload... }
    }
    """
    invalidate_release_gate_job_poll_cache(project_id, job_id)
    if not cache_service.enabled:
        return
    try:
        cache_service.set(
            release_gate_job_status_cache_key(project_id, job_id),
            job_payload if isinstance(job_payload, dict) else {},
            ttl=RELEASE_GATE_STATUS_CACHE_TTL_SEC,
        )
        payload = {
            "type": str(event_type or "job_updated"),
            "project_id": int(project_id),
            "job_id": str(job_id),
            "job": job_payload if isinstance(job_payload, dict) else {},
        }
        cache_service.redis_client.publish(
            release_gate_job_events_channel(project_id, job_id),
            json.dumps(payload, default=str),
        )
    except Exception as exc:
        logger.debug(
            "publish_release_gate_job_updated failed",
            extra={"project_id": project_id, "job_id": str(job_id), "error": str(exc)},
        )
