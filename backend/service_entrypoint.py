#!/usr/bin/env python3
"""
Railway service entrypoint for shared monorepo deploys.

Both web and worker services read the same backend/railway.json, so this file
switches process type via SERVICE_ROLE:
  - SERVICE_ROLE=web                  -> starts FastAPI web server (start.py)
  - SERVICE_ROLE=worker / ingest      -> starts ingest worker
  - SERVICE_ROLE=release-gate-worker  -> starts Release Gate worker

Default is web for safer production behavior.
"""

import os
import sys


def _normalize_service_role(raw_role: str | None) -> str:
    return str(raw_role or "web").strip().lower()


def resolve_service_command(raw_role: str | None) -> tuple[str, list[str], str]:
    role = _normalize_service_role(raw_role)

    if role in {"worker", "ingest-worker", "ingest"}:
        return role, [sys.executable, "-m", "app.workers.ingest_worker"], "ingest worker"

    if role in {
        "release-gate-worker",
        "release_gate_worker",
        "release-gate",
        "release_gate",
        "rg-worker",
        "rg",
    }:
        return (
            role,
            [sys.executable, "-m", "app.workers.release_gate_worker"],
            "release gate worker",
        )

    return role or "web", [sys.executable, "start.py"], "web server"


def main() -> None:
    role, cmd, label = resolve_service_command(os.getenv("SERVICE_ROLE", "web"))

    print(f"[service_entrypoint] SERVICE_ROLE={role} -> {label}", file=sys.stderr)

    os.execvp(cmd[0], cmd)


if __name__ == "__main__":
    main()
