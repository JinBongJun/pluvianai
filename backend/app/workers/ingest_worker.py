"""
Ingest worker: pops SDK api-call payloads from Redis and persists to DB.

Run as a separate process when Redis is used for the ingest queue (Phase 3).
  cd backend && python -m app.workers.ingest_worker

Procfile: worker: python -m app.workers.ingest_worker

Env:
  INGEST_WORKER_SKIP_MIGRATION_CHECK=1  Skip Alembic head check (emergency / special dev only).
"""

from __future__ import annotations

import json
import os
import sys
import time

import redis

from app.core.config import settings
from app.core.logging_config import logger
from app.core.migration_readiness import database_migrations_at_head
from app.services.background_tasks import background_task_service
from app.services.ops_alerting import ops_alerting


def _migration_check_or_exit() -> None:
    if os.getenv("INGEST_WORKER_SKIP_MIGRATION_CHECK", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        logger.warning(
            "INGEST_WORKER_SKIP_MIGRATION_CHECK is set; skipping Alembic head check "
            "(not recommended for production)"
        )
        return
    ok, msg = database_migrations_at_head()
    if not ok:
        logger.error("Ingest worker refusing to start: %s", msg)
        sys.exit(1)
    logger.info("Ingest worker migration check passed: %s", msg)


def _push_dlq(r: redis.Redis, raw: str) -> None:
    try:
        r.lpush(settings.INGEST_DLQ_KEY, raw)
    except Exception as exc:
        logger.error("Failed to push ingest payload to DLQ (%s): %s", settings.INGEST_DLQ_KEY, exc)


def _process_one(r: redis.Redis, raw: str) -> bool:
    """
    Persist one queue item. Returns True if committed to DB.
    On failure, pushes original raw JSON to DLQ (best-effort) and returns False.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("Ingest worker invalid JSON from queue: %s", e)
        _push_dlq(r, raw)
        return False

    try:
        project_id = data.get("project_id")
        status_code = int(data.get("status_code", 200))
        call_id = background_task_service._save_api_call_sync(
            project_id=data["project_id"],
            request_data=data.get("request_data") or {},
            response_data=data.get("response_data") or {},
            normalized=data.get("normalized") or {},
            latency_ms=data.get("latency_ms", 0),
            status_code=status_code,
            agent_name=data.get("agent_name"),
            chain_id=data.get("chain_id"),
            tool_events=data.get("tool_events"),
        )
        if call_id is None:
            logger.error(
                "Ingest persist returned no api_call id; sending payload to DLQ (queue=%s)",
                settings.INGEST_DLQ_KEY,
            )
            _push_dlq(r, raw)
            return False
        if project_id is not None:
            ops_alerting.observe_snapshot_status(project_id=project_id, status_code=status_code)
        return True
    except Exception as e:
        logger.exception("Ingest worker failed to process payload: %s", e)
        _push_dlq(r, raw)
        return False


def main() -> None:
    logger.info(
        "Ingest worker starting (queue=%s, dlq=%s)",
        settings.INGEST_QUEUE_KEY,
        settings.INGEST_DLQ_KEY,
    )
    _migration_check_or_exit()

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

    processed_ok = 0
    last_queue_log = time.monotonic()
    while True:
        try:
            result = r.brpop(settings.INGEST_QUEUE_KEY, timeout=5)
            if result:
                _key, raw = result
                if _process_one(r, raw):
                    processed_ok += 1
                    if processed_ok % 100 == 0:
                        logger.info(
                            "Ingest worker persisted %d items (queue=%s)",
                            processed_ok,
                            settings.INGEST_QUEUE_KEY,
                        )
            else:
                # Idle: log queue depth periodically for observability
                now = time.monotonic()
                if now - last_queue_log >= 60.0:
                    try:
                        qlen = r.llen(settings.INGEST_QUEUE_KEY)
                        dlq_len = r.llen(settings.INGEST_DLQ_KEY)
                        logger.info(
                            "Ingest worker idle, queue_depth=%d, dlq_depth=%d, total_persisted=%d",
                            qlen,
                            dlq_len,
                            processed_ok,
                        )
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
        except KeyboardInterrupt:
            logger.info("Ingest worker interrupted; stopping.")
            break
        except Exception as e:
            logger.exception("Ingest worker unexpected error: %s", e)
            time.sleep(1)


if __name__ == "__main__":
    main()
