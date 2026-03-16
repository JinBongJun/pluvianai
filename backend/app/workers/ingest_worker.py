"""
Ingest worker: pops SDK api-call payloads from Redis and persists to DB.

Run as a separate process when Redis is used for the ingest queue (Phase 3).
  python -m app.workers.ingest_worker

Procfile: worker: python -m app.workers.ingest_worker
"""

from __future__ import annotations

import json
import time

import redis

from app.core.config import settings
from app.core.logging_config import logger
from app.services.background_tasks import background_task_service
from app.services.ops_alerting import ops_alerting


def _process_one(payload: dict) -> None:
    """Run _save_api_call_sync and observe snapshot status for one payload."""
    try:
        project_id = payload.get("project_id")
        status_code = int(payload.get("status_code", 200))
        background_task_service._save_api_call_sync(
            project_id=payload["project_id"],
            request_data=payload.get("request_data") or {},
            response_data=payload.get("response_data") or {},
            normalized=payload.get("normalized") or {},
            latency_ms=payload.get("latency_ms", 0),
            status_code=status_code,
            agent_name=payload.get("agent_name"),
            chain_id=payload.get("chain_id"),
        )
        if project_id is not None:
            ops_alerting.observe_snapshot_status(project_id=project_id, status_code=status_code)
    except Exception as e:
        logger.exception("Ingest worker failed to process payload: %s", e)


def main() -> None:
    logger.info("Ingest worker starting (queue=%s)", settings.INGEST_QUEUE_KEY)
    try:
        r = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=10,
        )
        r.ping()
    except Exception as e:
        logger.error("Ingest worker Redis connection failed: %s", e)
        return

    processed = 0
    last_queue_log = time.monotonic()
    while True:
        try:
            result = r.brpop(settings.INGEST_QUEUE_KEY, timeout=5)
            if result:
                _key, raw = result
                data = json.loads(raw)
                _process_one(data)
                processed += 1
                if processed % 100 == 0:
                    logger.info("Ingest worker processed %d items (queue=%s)", processed, settings.INGEST_QUEUE_KEY)
            else:
                # Idle: log queue depth periodically for observability
                now = time.monotonic()
                if now - last_queue_log >= 60.0:
                    try:
                        qlen = r.llen(settings.INGEST_QUEUE_KEY)
                        logger.info("Ingest worker idle, queue_depth=%d, total_processed=%d", qlen, processed)
                    except Exception:
                        pass
                    last_queue_log = now
                time.sleep(0.1)
        except redis.ConnectionError as e:
            logger.warning("Ingest worker Redis connection error, reconnecting: %s", e)
            time.sleep(5)
            try:
                r = redis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=10,
                )
                r.ping()
            except Exception as reconn:
                logger.error("Ingest worker Redis reconnect failed: %s", reconn)
                time.sleep(10)
        except json.JSONDecodeError as e:
            logger.warning("Ingest worker invalid JSON from queue: %s", e)
        except KeyboardInterrupt:
            logger.info("Ingest worker interrupted; stopping.")
            break
        except Exception as e:
            logger.exception("Ingest worker unexpected error: %s", e)
            time.sleep(1)


if __name__ == "__main__":
    main()
