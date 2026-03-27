from app.models.subscription import Subscription
from app.core.usage_limits import get_limit_status
from app.services.subscription_service import SubscriptionService


def test_get_user_plan_includes_organizations_limit(db, test_user):
    db.add(Subscription(user_id=test_user.id, plan_type="starter", status="active"))
    db.commit()

    plan_info = SubscriptionService(db).get_user_plan(test_user.id)

    assert plan_info["plan_type"] == "starter"
    assert plan_info["limits"]["organizations"] == 3
    assert plan_info["limits"]["projects"] == 8


def test_get_limit_status_uses_paid_plan_limits(db, test_user):
    db.add(Subscription(user_id=test_user.id, plan_type="starter", status="active"))
    db.commit()

    snapshots_status = get_limit_status(db, test_user.id, "snapshots")
    replay_status = get_limit_status(db, test_user.id, "platform_replay_credits")

    assert snapshots_status["plan_type"] == "starter"
    assert snapshots_status["limit"] == 50_000
    assert snapshots_status["current"] == 0
    assert snapshots_status["remaining"] == 50_000

    assert replay_status["plan_type"] == "starter"
    assert replay_status["limit"] == 600
    assert replay_status["current"] == 0
    assert replay_status["remaining"] == 600
