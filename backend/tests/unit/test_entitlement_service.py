from datetime import datetime, timezone

from app.models.subscription import Subscription
from app.services.entitlement_service import EntitlementService


def test_get_or_create_current_entitlement_defaults_to_free(db, test_user):
    snapshot = EntitlementService(db).get_or_create_current_entitlement(test_user.id)

    assert snapshot.effective_plan_id == "free"
    assert snapshot.entitlement_status == "free"
    assert snapshot.subscription_id is None


def test_sync_current_entitlement_keeps_paid_access_until_period_end(db, test_user):
    subscription = Subscription(
        user_id=test_user.id,
        plan_type="pro",
        status="cancelled",
        current_period_start=datetime(2026, 3, 1, tzinfo=timezone.utc),
        current_period_end=datetime(2099, 4, 1, tzinfo=timezone.utc),
    )
    db.add(subscription)
    db.commit()

    snapshot = EntitlementService(db).sync_current_entitlement(test_user.id, subscription=subscription, source="test")

    assert snapshot.effective_plan_id == "pro"
    assert snapshot.entitlement_status == "active_until_period_end"
    assert snapshot.effective_to is not None


def test_sync_current_entitlement_expires_cancelled_subscription_after_period_end(db, test_user):
    subscription = Subscription(
        user_id=test_user.id,
        plan_type="starter",
        status="cancelled",
        current_period_start=datetime(2025, 1, 1, tzinfo=timezone.utc),
        current_period_end=datetime(2025, 2, 1, tzinfo=timezone.utc),
    )
    db.add(subscription)
    db.commit()

    snapshot = EntitlementService(db).sync_current_entitlement(test_user.id, subscription=subscription, source="test")

    assert snapshot.effective_plan_id == "free"
    assert snapshot.entitlement_status == "expired"
