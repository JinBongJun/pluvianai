"""
Standalone Release Gate worker process.

Production setup:
- Run the FastAPI web server with RELEASE_GATE_JOB_RUNNER_ENABLED=false
- Run this module in a separate process to execute queued jobs

Example:
  python -m app.workers.release_gate_worker
"""

from __future__ import annotations

import asyncio

from app.core.logging_config import logger
from app.services.release_gate_job_runner import release_gate_job_runner


async def _main() -> None:
    try:
        await release_gate_job_runner.start()
    finally:
        try:
            await release_gate_job_runner.stop()
        except Exception:
            pass


def main() -> None:
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        logger.info("Release Gate worker interrupted; stopping.")


if __name__ == "__main__":
    main()

