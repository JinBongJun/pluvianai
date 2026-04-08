from app.models.user import User
from app.services.account_deletion_service import AccountDeletionService


def test_tombstone_inactive_user_identities_updates_legacy_deleted_accounts(db):
    active_user = User(
        email="active@example.com",
        hashed_password="hash",
        full_name="Active User",
        is_active=True,
        password_login_enabled=True,
        google_login_enabled=False,
    )
    legacy_deleted = User(
        email="legacy@example.com",
        hashed_password="hash",
        full_name="Legacy Deleted",
        is_active=False,
        password_login_enabled=True,
        google_login_enabled=True,
        google_id="legacy-google-sub",
    )
    already_tombstoned = User(
        email="deleted-user-999-1234567890@deleted.local",
        hashed_password="hash",
        full_name="Already Tombstoned",
        is_active=False,
        password_login_enabled=False,
        google_login_enabled=False,
        google_id="deleted-google-999-1234567890",
    )
    db.add_all([active_user, legacy_deleted, already_tombstoned])
    db.commit()
    db.refresh(legacy_deleted)
    db.refresh(already_tombstoned)

    changed = AccountDeletionService(db).tombstone_inactive_user_identities()
    db.commit()
    db.refresh(active_user)
    db.refresh(legacy_deleted)
    db.refresh(already_tombstoned)

    assert changed == 1
    assert active_user.email == "active@example.com"
    assert legacy_deleted.email.startswith(f"deleted-user-{legacy_deleted.id}-")
    assert legacy_deleted.google_id.startswith(f"deleted-google-{legacy_deleted.id}-")
    assert legacy_deleted.password_login_enabled is False
    assert legacy_deleted.google_login_enabled is False
    assert already_tombstoned.email == "deleted-user-999-1234567890@deleted.local"
    assert already_tombstoned.google_id == "deleted-google-999-1234567890"
