"""
DB migration readiness checks for background workers and ops.

Ensures Alembic revision in the database matches the codebase head before
consuming side-effectful queues (e.g. ingest worker).
"""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory


def _backend_dir() -> Path:
    # backend/app/core/migration_readiness.py -> backend/
    return Path(__file__).resolve().parent.parent.parent


def database_migrations_at_head() -> tuple[bool, str]:
    """
    Returns (True, message) if DB revision matches Alembic head.
    (False, reason) if mismatch, error, or no head (multiple heads not handled specially).
    """
    backend_dir = _backend_dir()
    alembic_ini = backend_dir / "alembic.ini"
    if not alembic_ini.is_file():
        return False, f"alembic.ini not found at {alembic_ini}"

    from app.core.database import engine

    alembic_cfg = Config(str(alembic_ini))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))

    try:
        script = ScriptDirectory.from_config(alembic_cfg)
        head_rev = script.get_current_head()
    except Exception as e:
        return False, f"failed to read Alembic scripts: {e}"

    if not head_rev:
        return False, "no Alembic head revision (resolve migration branches)"

    try:
        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current_rev = context.get_current_revision()
    except Exception as e:
        return False, f"failed to read DB migration state: {e}"

    if current_rev != head_rev:
        return (
            False,
            f"database migration mismatch: current={current_rev!r} required_head={head_rev!r} "
            f"(run: cd backend && alembic upgrade head)",
        )

    return True, f"alembic at head ({head_rev})"
