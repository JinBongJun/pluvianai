import pytest
from fastapi import status


@pytest.mark.integration
@pytest.mark.asyncio
class TestAdminOpsAlertsDryRun:
    async def test_ops7_superuser_dry_run_endpoint_returns_202(
        self, async_client, auth_headers, db, test_user, monkeypatch
    ):
        from app.api.v1.endpoints.admin import ops_alerts as ops_alerts_endpoint

        test_user.is_superuser = True
        db.commit()

        sent = {"count": 0}

        def _fake_emit_test_alert(*, event_type, severity, title, summary, payload=None):
            sent["count"] += 1
            return None

        monkeypatch.setattr(
            ops_alerts_endpoint.ops_alerting,
            "emit_test_alert",
            _fake_emit_test_alert,
            raising=True,
        )

        response = await async_client.post(
            "/api/v1/admin/ops-alerts/test",
            json={
                "event_type": "custom",
                "project_id": 1,
                "repeats": 1,
                "custom_severity": "warning",
                "custom_title": "Dry-run test",
                "custom_summary": "dry-run endpoint smoke",
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
        data = response.json()
        assert data.get("accepted") is True
        assert data.get("event_type") == "custom"
        assert sent["count"] == 1

    async def test_provider_error_burst_dry_run_supported(
        self, async_client, auth_headers, db, test_user, monkeypatch
    ):
        from app.api.v1.endpoints.admin import ops_alerts as ops_alerts_endpoint

        test_user.is_superuser = True
        db.commit()

        sent = {"count": 0}

        def _fake_observe_provider_error(*args, **kwargs):
            sent["count"] += 1
            return None

        monkeypatch.setattr(
            ops_alerts_endpoint.ops_alerting,
            "observe_provider_error",
            _fake_observe_provider_error,
            raising=True,
        )

        response = await async_client.post(
            "/api/v1/admin/ops-alerts/test",
            json={
                "event_type": "provider_error_burst",
                "project_id": 1,
                "repeats": 2,
                "provider": "openai",
                "error_code": "missing_provider_keys",
                "error_summary": "dry-run",
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
        data = response.json()
        assert data.get("accepted") is True
        assert data.get("event_type") == "provider_error_burst"
        assert sent["count"] == 2
