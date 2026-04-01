from datetime import datetime, timedelta, timezone
import uuid

import pytest
from fastapi import status

from app.models.behavior_report import BehaviorReport
from app.models.release_gate_run import ReleaseGateRun
from app.models.snapshot import Snapshot
from app.models.trace import Trace


@pytest.mark.integration
@pytest.mark.asyncio
class TestReleaseGateHistoryApi:
    async def test_history_ignores_mixed_behavior_reports_when_counting_and_paging(
        self, async_client, auth_headers, test_project, db
    ):
        now = datetime.now(timezone.utc)
        release_gate_report_id = str(uuid.uuid4())

        db.add(
            BehaviorReport(
                id=release_gate_report_id,
                project_id=test_project.id,
                trace_id="rg-trace-visible",
                agent_id="agent-history",
                status="pass",
                summary_json={
                    "release_gate": {
                        "mode": "replay_test",
                        "repeat_runs": 1,
                        "total_inputs": 2,
                        "failed_inputs": 0,
                        "flaky_inputs": 0,
                        "passed_attempts": 2,
                        "total_attempts": 2,
                        "thresholds": {"fail_rate_max": 0.2},
                    }
                },
                violations_json=[],
                created_at=now - timedelta(hours=1),
            )
        )

        for idx in range(205):
            db.add(
                BehaviorReport(
                    id=str(uuid.uuid4()),
                    project_id=test_project.id,
                    trace_id=f"non-rg-{idx}",
                    agent_id="agent-other",
                    status="pass",
                    summary_json={"policy": {"kind": "not-release-gate"}},
                    violations_json=[],
                    created_at=now - timedelta(minutes=idx),
                )
            )

        db.commit()

        res = await async_client.get(
            f"/api/v1/projects/{test_project.id}/release-gate/history",
            headers=auth_headers,
        )
        assert res.status_code == status.HTTP_200_OK
        payload = res.json()
        assert payload["total"] == 1
        assert len(payload["items"]) == 1
        assert payload["items"][0]["id"] == release_gate_report_id

    async def test_history_maps_input_level_counts_from_release_gate_summary(
        self, async_client, auth_headers, test_project, db
    ):
        report_id = str(uuid.uuid4())
        db.add(
            BehaviorReport(
                id=report_id,
                project_id=test_project.id,
                trace_id="rg-trace-counts",
                agent_id="agent-counts",
                status="fail",
                summary_json={
                    "release_gate": {
                        "mode": "replay_test",
                        "repeat_runs": 3,
                        "total_inputs": 5,
                        "failed_inputs": 2,
                        "flaky_inputs": 1,
                        "passed_attempts": 9,
                        "total_attempts": 15,
                        "thresholds": {"fail_rate_max": 0.2},
                    }
                },
                violations_json=[],
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        res = await async_client.get(
            f"/api/v1/projects/{test_project.id}/release-gate/history",
            headers=auth_headers,
        )
        assert res.status_code == status.HTTP_200_OK
        payload = res.json()
        item = next(entry for entry in payload["items"] if entry["id"] == report_id)
        assert item["total_inputs"] == 5
        assert item["failed_runs"] == 3
        assert item["passed_runs"] == 2
        assert item["passed_attempts"] == 9
        assert item["total_attempts"] == 15

    async def test_history_can_scope_results_to_selected_agent_and_backfill_read_model(
        self, async_client, auth_headers, test_project, db
    ):
        now = datetime.now(timezone.utc)
        db.add_all(
            [
                BehaviorReport(
                    id=str(uuid.uuid4()),
                    project_id=test_project.id,
                    trace_id="rg-trace-agent-a-1",
                    agent_id="agent-a",
                    status="pass",
                    summary_json={"release_gate": {"mode": "replay_test", "total_inputs": 1}},
                    violations_json=[],
                    created_at=now - timedelta(minutes=3),
                ),
                BehaviorReport(
                    id=str(uuid.uuid4()),
                    project_id=test_project.id,
                    trace_id="rg-trace-agent-a-2",
                    agent_id="agent-a",
                    status="fail",
                    summary_json={"release_gate": {"mode": "replay_test", "total_inputs": 2}},
                    violations_json=[],
                    created_at=now - timedelta(minutes=2),
                ),
                BehaviorReport(
                    id=str(uuid.uuid4()),
                    project_id=test_project.id,
                    trace_id="rg-trace-agent-b",
                    agent_id="agent-b",
                    status="pass",
                    summary_json={"release_gate": {"mode": "replay_test", "total_inputs": 1}},
                    violations_json=[],
                    created_at=now - timedelta(minutes=1),
                ),
            ]
        )
        db.commit()

        assert db.query(ReleaseGateRun).count() == 0

        res = await async_client.get(
            f"/api/v1/projects/{test_project.id}/release-gate/history",
            headers=auth_headers,
            params={"agent_id": "agent-a"},
        )
        assert res.status_code == status.HTTP_200_OK
        payload = res.json()

        assert payload["total"] == 2
        assert [item["agent_id"] for item in payload["items"]] == ["agent-a", "agent-a"]
        assert {item["trace_id"] for item in payload["items"]} == {
            "rg-trace-agent-a-1",
            "rg-trace-agent-a-2",
        }
        assert db.query(ReleaseGateRun).count() == 3

    async def test_history_backfill_recovers_agent_from_snapshot_when_report_agent_is_missing(
        self, async_client, auth_headers, test_project, db
    ):
        trace_id = "rg-trace-missing-agent"
        db.add(Trace(id=trace_id, project_id=test_project.id))
        db.flush()
        db.add(
            Snapshot(
                trace_id=trace_id,
                project_id=test_project.id,
                agent_id="agent-fallback",
                provider="openai",
                model="gpt-4o-mini",
                payload={"messages": []},
                is_sanitized=False,
                status_code=200,
            )
        )
        db.add(
            BehaviorReport(
                id=str(uuid.uuid4()),
                project_id=test_project.id,
                trace_id=trace_id,
                agent_id=None,
                status="pass",
                summary_json={"release_gate": {"mode": "replay_test", "total_inputs": 1}},
                violations_json=[],
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        res = await async_client.get(
            f"/api/v1/projects/{test_project.id}/release-gate/history",
            headers=auth_headers,
            params={"agent_id": "agent-fallback"},
        )
        assert res.status_code == status.HTTP_200_OK
        payload = res.json()
        assert payload["total"] == 1
        assert payload["items"][0]["agent_id"] == "agent-fallback"
        assert payload["items"][0]["trace_id"] == trace_id
