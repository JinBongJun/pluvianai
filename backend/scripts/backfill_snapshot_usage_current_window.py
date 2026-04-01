"""
Backfill snapshot usage for each user's active usage window.

Usage:
    python backend/scripts/backfill_snapshot_usage_current_window.py
"""

from app.core.database import SessionLocal
from app.core.logging_config import logger
from app.core.usage_limits import ensure_snapshot_usage_backfill_current_window
from app.models.user import User


def main() -> int:
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active.is_(True)).all()
        processed = 0
        for user in users:
            ensure_snapshot_usage_backfill_current_window(db, int(user.id))
            processed += 1
        db.commit()
        logger.info("Backfilled snapshot usage for %s active users", processed)
        return processed
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
