#!/usr/bin/env python3
"""
Railway service entrypoint for shared monorepo deploys.

Both web and worker services read the same backend/railway.json, so this file
switches process type via SERVICE_ROLE:
  - SERVICE_ROLE=web    -> starts FastAPI web server (start.py)
  - SERVICE_ROLE=worker -> starts ingest worker

Default is web for safer production behavior.
"""

import os
import sys


def main() -> None:
    role = os.getenv("SERVICE_ROLE", "web").strip().lower()

    if role in {"worker", "ingest-worker", "ingest"}:
        cmd = [sys.executable, "-m", "app.workers.ingest_worker"]
        print("[service_entrypoint] SERVICE_ROLE=worker -> ingest worker", file=sys.stderr)
    else:
        cmd = [sys.executable, "start.py"]
        print(f"[service_entrypoint] SERVICE_ROLE={role or 'web'} -> web server", file=sys.stderr)

    os.execvp(cmd[0], cmd)


if __name__ == "__main__":
    main()
