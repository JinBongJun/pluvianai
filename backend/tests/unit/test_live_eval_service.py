"""
Unit tests for live_eval_service: config-at-time (each snapshot evaluated with config active at its created_at).
"""
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.services.live_eval_service import (
    normalize_eval_config,
    _evaluate_one_snapshot,
    evaluate_recent_snapshots,
)


@pytest.mark.unit
class TestNormalizeEvalConfig:
    def test_default_enabled_true(self):
        out = normalize_eval_config({})
        assert out["enabled"] is True

    def test_empty_min_chars(self):
        out = normalize_eval_config({"empty": {"enabled": True, "min_chars": 50}})
        assert out["empty"]["min_chars"] == 50


@pytest.mark.unit
class TestEvaluateOneSnapshot:
    def test_empty_check_uses_config_min_chars(self):
        base_cfg = normalize_eval_config({})
        # Short response "hi" (2 chars): with min_chars=100 should fail, with min_chars=2 should pass
        s = {
            "id": 1,
            "created_at": "2026-02-20T10:00:00Z",
            "response_text": "hi",
            "latency_ms": 100,
            "status_code": 200,
            "tokens_used": 10,
            "cost": 0.0,
        }
        cfg_strict = {**base_cfg, "empty": {**base_cfg["empty"], "min_chars": 100}}
        cfg_loose = {**base_cfg, "empty": {**base_cfg["empty"], "min_chars": 2}}
        out_strict = _evaluate_one_snapshot(s, cfg_strict, 50.0, [], [], [])
        out_loose = _evaluate_one_snapshot(s, cfg_loose, 50.0, [], [], [])
        assert out_strict.get("empty") == "fail"
        assert out_loose.get("empty") == "pass"


@pytest.mark.unit
class TestEvaluateRecentSnapshotsConfigAtTime:
    """Test that each snapshot is evaluated with the config returned by get_config_at(created_at)."""

    def test_get_config_at_used_per_snapshot(self):
        # Two snapshots: first has short response, second has long response.
        # get_config_at returns strict empty (min_chars=100) for first created_at and loose (min_chars=5) for second.
        t1 = "2026-02-20T10:00:00+00:00"
        t2 = "2026-02-20T12:00:00+00:00"
        mock_s1 = MagicMock()
        mock_s1.id = 1
        mock_s1.created_at = datetime(2026, 2, 20, 10, 0, 0, tzinfo=timezone.utc)
        mock_s1.response = "hi"
        mock_s1.latency_ms = 100
        mock_s1.status_code = 200
        mock_s1.tokens_used = 10
        mock_s1.cost = 0.0

        mock_s2 = MagicMock()
        mock_s2.id = 2
        mock_s2.created_at = datetime(2026, 2, 20, 12, 0, 0, tzinfo=timezone.utc)
        mock_s2.response = "hello world"
        mock_s2.latency_ms = 150
        mock_s2.status_code = 200
        mock_s2.tokens_used = 20
        mock_s2.cost = 0.0

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            mock_s2,
            mock_s1,
        ]  # desc then reverse -> [s1, s2]

        base_cfg = normalize_eval_config({})
        strict_empty = {**base_cfg, "empty": {**base_cfg["empty"], "enabled": True, "min_chars": 100}}
        loose_empty = {**base_cfg, "empty": {**base_cfg["empty"], "enabled": True, "min_chars": 5}}

        def get_config_at(created_at):
            if created_at == t1 or (isinstance(created_at, str) and "10:00" in created_at):
                return strict_empty
            return loose_empty

        result = evaluate_recent_snapshots(
            mock_db, project_id=1, agent_id="agent1", eval_config=base_cfg, get_config_at=get_config_at
        )

        assert result["total_snapshots"] == 2
        per = result["per_snapshot"]
        assert len(per) == 2
        # First snapshot (oldest, s1) used strict -> "hi" is too short -> fail
        assert per[0]["snapshot_id"] == 1
        assert per[0]["checks"].get("empty") == "fail"
        # Second snapshot (newer, s2) used loose -> "hello world" is long enough -> pass
        assert per[1]["snapshot_id"] == 2
        assert per[1]["checks"].get("empty") == "pass"

    def test_without_get_config_at_single_config(self):
        """Without get_config_at, all snapshots use the same eval_config."""
        mock_s = MagicMock()
        mock_s.id = 1
        mock_s.created_at = datetime(2026, 2, 20, 10, 0, 0, tzinfo=timezone.utc)
        mock_s.response = "hi"
        mock_s.latency_ms = 100
        mock_s.status_code = 200
        mock_s.tokens_used = 10
        mock_s.cost = 0.0

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            mock_s
        ]

        cfg = normalize_eval_config({"empty": {"enabled": True, "min_chars": 100}})
        result = evaluate_recent_snapshots(mock_db, project_id=1, agent_id="a1", eval_config=cfg)
        assert result["total_snapshots"] == 1
        assert result["per_snapshot"][0]["checks"].get("empty") == "fail"
