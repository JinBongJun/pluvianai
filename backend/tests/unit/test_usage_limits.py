import pytest

from app.core.usage_limits import (
    check_platform_replay_credits_limit,
    get_platform_replay_credits_this_month,
)
from app.models.subscription import Subscription
from app.models.usage import Usage


@pytest.mark.unit
class TestUsageLimits:
    def test_get_platform_replay_credits_this_month_sums_usage(self, db, test_user, test_project):
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=320,
                unit="credits",
            )
        )
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=180,
                unit="credits",
            )
        )
        db.commit()

        assert get_platform_replay_credits_this_month(db, test_user.id) == 500

    def test_check_platform_replay_credits_limit_blocks_at_free_cap(self, db, test_user, test_project):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=1000,
                unit="credits",
            )
        )
        db.commit()

        allowed, message = check_platform_replay_credits_limit(db, test_user.id)

        assert allowed is False
        assert message is not None
        assert "own provider key" in message.lower()
        assert "release gate" in message.lower()
