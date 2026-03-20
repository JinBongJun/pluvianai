"""
Regression tests for Live View snapshot route matching.
"""

from datetime import datetime, timezone

import pytest
from fastapi import status

from app.models.snapshot import Snapshot
from app.models.trace import Trace


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
