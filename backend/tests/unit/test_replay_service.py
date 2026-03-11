import pytest

from app.models.usage import Usage
from app.services.replay_service import _persist_replay_usage


@pytest.mark.unit
class TestReplayUsagePersistence:
    def test_persist_replay_usage_skips_byok_runs(self, db, test_project):
        _persist_replay_usage(
            db,
            test_project.id,
            results=[{"success": True, "used_credits": 120}],
            track_platform_credits=False,
        )
        db.commit()

        records = db.query(Usage).all()
        assert records == []

    def test_persist_replay_usage_records_only_successful_platform_runs(self, db, test_project):
        _persist_replay_usage(
            db,
            test_project.id,
            results=[
                {"success": True, "used_credits": 120},
                {"success": False, "used_credits": 999},
                {"success": True, "used_credits": 30},
            ],
            track_platform_credits=True,
        )
        db.commit()

        records = db.query(Usage).all()
        assert len(records) == 1
        assert records[0].metric_name == "guard_credits_replay"
        assert records[0].quantity == 150
        assert records[0].project_id == test_project.id
        assert records[0].user_id == test_project.owner_id
