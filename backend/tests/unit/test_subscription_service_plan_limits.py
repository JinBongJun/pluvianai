from app.models.subscription import Subscription
from app.models.organization import Organization
from app.models.project import Project
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


def test_get_limit_status_handles_missing_db_for_error_payload():
    snapshots_status = get_limit_status(None, user_id=999, metric="snapshots")
    replay_status = get_limit_status(None, user_id=999, metric="platform_replay_credits")

    assert snapshots_status["plan_type"] == "free"
    assert snapshots_status["current"] == 0
    assert snapshots_status["limit"] == 10_000
    assert snapshots_status["remaining"] == 10_000

    assert replay_status["plan_type"] == "free"
    assert replay_status["current"] == 0
    assert replay_status["limit"] == 60
    assert replay_status["remaining"] == 60


def test_get_limit_status_supports_org_and_project_metrics(db, test_user):
    db.add(Subscription(user_id=test_user.id, plan_type="starter", status="active"))
    db.add(Organization(name="Org A", owner_id=test_user.id, plan_type="free"))
    db.add(Project(name="Proj A", owner_id=test_user.id, is_active=True, is_deleted=False))
    db.commit()

    org_status = get_limit_status(db, test_user.id, "organizations")
    project_status = get_limit_status(db, test_user.id, "projects")

    assert org_status["metric"] == "organizations"
    assert org_status["limit"] == 3
    assert org_status["current"] == 1
    assert org_status["remaining"] == 2

    assert project_status["metric"] == "projects"
    assert project_status["limit"] == 8
    assert project_status["current"] == 1
    assert project_status["remaining"] == 7
