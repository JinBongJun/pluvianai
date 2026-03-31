from datetime import datetime, timedelta, timezone

import pytest

from app.core.usage_limits import (
    check_release_gate_attempts_limit,
    check_snapshot_limit,
    check_platform_replay_credits_limit,
    get_release_gate_attempts_this_month,
    get_platform_replay_credits_this_month,
    get_usage_period_bounds_utc,
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

    def test_get_release_gate_attempts_this_month_sums_usage(self, db, test_user, test_project):
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="release_gate_attempts",
                quantity=12,
                unit="count",
            )
        )
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="release_gate_attempts",
                quantity=8,
                unit="count",
            )
        )
        db.commit()

        assert get_release_gate_attempts_this_month(db, test_user.id) == 20

    def test_check_release_gate_attempts_limit_blocks_at_free_cap(self, db, test_user, test_project):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="release_gate_attempts",
                quantity=60,
                unit="count",
            )
        )
        db.commit()

        allowed, message = check_release_gate_attempts_limit(db, test_user.id, amount=1)

        assert allowed is False
        assert message is not None
        assert "replay attempt" in message.lower()
        assert "release gate" in message.lower()

    def test_superuser_skips_release_gate_attempt_limit(self, db, test_user, test_project):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="release_gate_attempts",
                quantity=9999,
                unit="count",
            )
        )
        db.commit()

        allowed, message = check_release_gate_attempts_limit(
            db, test_user.id, amount=5, is_superuser=True
        )
        assert allowed is True
        assert message is None

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

    def test_superuser_skips_platform_replay_credit_limit(self, db, test_user, test_project):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=9999,
                unit="credits",
            )
        )
        db.commit()

        allowed, message = check_platform_replay_credits_limit(db, test_user.id, is_superuser=True)
        assert allowed is True
        assert message is None

    def test_superuser_skips_snapshot_limit(self, db, test_user):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()

        allowed, message = check_snapshot_limit(db, test_user.id, is_superuser=True)
        assert allowed is True
        assert message is None

    def test_paid_usage_window_matches_subscription_period(self, db, test_user, test_project):
        """Hosted replay credits sum over Paddle billing period, not calendar month only."""
        now = datetime.now(timezone.utc)
        ps = now - timedelta(days=2)
        pe = now + timedelta(days=28)
        db.add(
            Subscription(
                user_id=test_user.id,
                plan_id="pro",
                status="active",
                paddle_subscription_id="sub_test_usage",
                current_period_start=ps,
                current_period_end=pe,
            )
        )
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=40,
                unit="credits",
            )
        )
        db.commit()

        window_start, window_end = get_usage_period_bounds_utc(db, test_user.id)
        assert window_start == ps
        assert window_end == pe
        assert get_platform_replay_credits_this_month(db, test_user.id) == 40

        stale = Usage(
            user_id=test_user.id,
            project_id=test_project.id,
            metric_name="guard_credits_replay",
            quantity=999,
            unit="credits",
        )
        stale.timestamp = ps - timedelta(days=1)
        db.add(stale)
        db.commit()

        assert get_platform_replay_credits_this_month(db, test_user.id) == 40
