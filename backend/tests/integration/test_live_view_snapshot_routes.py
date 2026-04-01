"""
Regression tests for Live View snapshot route matching.
"""

from datetime import datetime, timezone

import pytest
from fastapi import status

from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.models.subscription import Subscription
from app.models.usage import Usage


@pytest.mark.integration
class TestLiveViewSnapshotRoutes:
    def test_deleted_snapshots_route_does_not_bind_to_snapshot_id(
        self, client, db, auth_headers, test_project
    ):
        trace = Trace(id="trace-live-view-deleted-route", project_id=test_project.id)
        db.add(trace)
        db.flush()

        deleted_snapshot = Snapshot(
            project_id=test_project.id,
            trace_id=trace.id,
            agent_id="agent-1",
            provider="openai",
            model="gpt-4o-mini",
            payload={"messages": [{"role": "user", "content": "hello"}]},
            status_code=200,
            is_deleted=True,
            deleted_at=datetime.now(timezone.utc),
        )
        db.add(deleted_snapshot)
        db.commit()
        db.refresh(deleted_snapshot)

        response = client.get(
            f"/api/v1/projects/{test_project.id}/snapshots/deleted",
            params={"days": 30, "limit": 200, "offset": 0},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["count"] == 1
        assert payload["items"][0]["id"] == deleted_snapshot.id

    def test_alert_stats_route_does_not_bind_to_alert_id(
        self, client, auth_headers, test_project
    ):
        response = client.get(
            f"/api/v1/projects/{test_project.id}/alerts/stats",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["open_alerts"] == 0

    def test_api_call_stats_route_does_not_bind_to_call_id(
        self, client, auth_headers, test_project
    ):
        response = client.get(
            f"/api/v1/projects/{test_project.id}/api-calls/stats",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["total_calls"] == 0

    def test_snapshot_deletes_do_not_reduce_account_snapshot_usage(
        self, client, db, auth_headers, test_user, test_project
    ):
        db.add(Subscription(user_id=test_user.id, plan_type="starter", status="active"))
        trace = Trace(id="trace-live-view-delete-invariant", project_id=test_project.id)
        db.add(trace)
        db.flush()

        snapshot = Snapshot(
            project_id=test_project.id,
            trace_id=trace.id,
            agent_id="agent-ledger",
            provider="openai",
            model="gpt-4o-mini",
            payload={"messages": [{"role": "user", "content": "hello"}]},
            status_code=200,
        )
        db.add(snapshot)
        db.flush()
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="snapshots",
                quantity=1,
                unit="count",
                source_type="snapshot",
                source_id=str(snapshot.id),
                idempotency_key=f"snapshot:{snapshot.id}",
            )
        )
        db.commit()
        db.refresh(snapshot)

        before = client.get("/api/v1/auth/me/usage", headers=auth_headers)
        assert before.status_code == status.HTTP_200_OK
        assert before.json()["usage_current_period"]["snapshots"] == 1

        delete_res = client.delete(
            f"/api/v1/projects/{test_project.id}/snapshots/{snapshot.id}",
            headers=auth_headers,
        )
        assert delete_res.status_code == status.HTTP_200_OK

        after_soft_delete = client.get("/api/v1/auth/me/usage", headers=auth_headers)
        assert after_soft_delete.status_code == status.HTTP_200_OK
        assert after_soft_delete.json()["usage_current_period"]["snapshots"] == 1

        permanent_delete_res = client.post(
            f"/api/v1/projects/{test_project.id}/snapshots/deleted/permanent-delete",
            json={"snapshot_ids": [snapshot.id]},
            headers=auth_headers,
        )
        assert permanent_delete_res.status_code == status.HTTP_200_OK

        after_hard_delete = client.get("/api/v1/auth/me/usage", headers=auth_headers)
        assert after_hard_delete.status_code == status.HTTP_200_OK
        assert after_hard_delete.json()["usage_current_period"]["snapshots"] == 1

    def test_live_view_agents_sum_multi_model_totals_for_same_agent(
        self, client, db, auth_headers, test_project
    ):
        trace_a = Trace(id="trace-live-view-model-a", project_id=test_project.id)
        trace_b = Trace(id="trace-live-view-model-b", project_id=test_project.id)
        db.add_all([trace_a, trace_b])
        db.flush()

        db.add_all(
            [
                Snapshot(
                    project_id=test_project.id,
                    trace_id=trace_a.id,
                    agent_id="agent-shared",
                    provider="openai",
                    model="gpt-4o-mini",
                    payload={"messages": [{"role": "user", "content": "hello"}]},
                    status_code=200,
                ),
                Snapshot(
                    project_id=test_project.id,
                    trace_id=trace_b.id,
                    agent_id="agent-shared",
                    provider="openai",
                    model="gpt-4.1-mini",
                    payload={"messages": [{"role": "user", "content": "hello again"}]},
                    status_code=200,
                ),
            ]
        )
        db.commit()

        response = client.get(
            f"/api/v1/projects/{test_project.id}/live-view/agents",
            params={"include_deleted": True, "compact": True, "limit": 30},
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        agent = next((row for row in payload["agents"] if row["agent_id"] == "agent-shared"), None)
        assert agent is not None
        assert agent["total"] == 2
