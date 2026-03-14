import pytest

from app.models.subscription import Subscription
from app.services.subscription_service import SubscriptionService


@pytest.mark.unit
class TestSubscriptionServiceUsageTracking:
    def test_increment_usage_persists_metric_name_rows(self, db, test_user, test_project):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()

        service = SubscriptionService(db)
        service.increment_usage(
            user_id=test_user.id,
            metric_type="api_calls",
            amount=3,
            project_id=test_project.id,
        )
        service.increment_usage(
            user_id=test_user.id,
            metric_type="api_calls",
            amount=2,
            project_id=test_project.id,
        )

        summary = service.get_usage_summary(test_user.id)
        assert summary["metrics"]["api_calls"]["current"] == 5

    def test_check_usage_limit_uses_monthly_sum(self, db, test_user, test_project):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()

        service = SubscriptionService(db)
        service.increment_usage(
            user_id=test_user.id,
            metric_type="judge_calls",
            amount=100,
            project_id=test_project.id,
        )

        allowed, message = service.check_usage_limit(test_user.id, "judge_calls", amount=1)
        assert allowed is False
        assert message is not None
        assert "limit exceeded" in message.lower()
