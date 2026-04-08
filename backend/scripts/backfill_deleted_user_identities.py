"""
Backfill tombstoned identity fields for previously deleted users.

Use this after deploying the account-deletion tombstone logic so older
inactive users no longer block re-registration by email or Google account.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.services.account_deletion_service import AccountDeletionService


def run_backfill(*, dry_run: bool) -> int:
    db = SessionLocal()
    try:
        service = AccountDeletionService(db)
        before = service.tombstone_inactive_user_identities()
        if dry_run:
            db.rollback()
            print(f"[dry-run] Would tombstone {before} inactive user account(s).")
        else:
            db.commit()
            print(f"Tombstoned {before} inactive user account(s).")
        return before
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist changes. Without this flag the script runs in dry-run mode.",
    )
    args = parser.parse_args()
    run_backfill(dry_run=not args.apply)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
