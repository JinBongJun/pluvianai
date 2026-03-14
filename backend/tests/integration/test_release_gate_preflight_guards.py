import pytest
from fastapi import status

from app.models.snapshot import Snapshot
from app.models.subscription import Subscription
from app.models.trace import Trace


def _extract_error_code(data: dict) -> str | None:
    detail = data.get("detail") if isinstance(data, dict) else None
    if isinstance(detail, dict):
        return detail.get("error_code") or detail.get("code")
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        details = err.get("details")
        if isinstance(details, dict):
            nested = (
                details.get("error_code")
                or details.get("code")
                or (details.get("detail", {}) if isinstance(details.get("detail"), dict) else {}).get("error_code")
            )
            if nested:
                return str(nested)
        details = err.get("details")
        if isinstance(details, dict) and details.get("code"):
            return details.get("code")
        return err.get("code")
    return None


@pytest.mark.integration
@pytest.mark.asyncio
class TestReleaseGatePreflightGuards:
    async def test_provider_resolution_failed_when_snapshot_provider_unresolvable(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        trace = Trace(id="rg-preflight-trace-1", project_id=test_project.id)
        db.add(trace)
        db.add(
            Snapshot(
                project_id=test_project.id,
                trace_id=trace.id,
                agent_id="agent-A",
                provider="",
                model="",
                payload={},
                user_message="hello",
                response="world",
            )
        )
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate",
            json={
                "trace_id": trace.id,
                "model_source": "detected",
                "repeat_runs": 1,
                "max_snapshots": 1,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        data = response.json()
        assert _extract_error_code(data) == "provider_resolution_failed"

    async def test_release_gate_requires_pinned_model_for_anthropic_in_production(
        self, async_client, auth_headers, db, test_user, test_project, monkeypatch
    ):
        from app.api.v1.endpoints import release_gate as rg

        trace = Trace(id="rg-preflight-trace-2", project_id=test_project.id)
        db.add(trace)
        db.add(
            Snapshot(
                project_id=test_project.id,
                trace_id=trace.id,
                agent_id="agent-A",
                provider="openai",
                model="gpt-4.1-mini",
                payload={},
                user_message="hello",
                response="world",
            )
        )
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
        test_user.is_superuser = False

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate",
            json={
                "trace_id": trace.id,
                "model_source": "platform",
                "replay_provider": "anthropic",
                "new_model": "claude-opus-4-6",
                "repeat_runs": 1,
                "max_snapshots": 1,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        data = response.json()
        assert _extract_error_code(data) == "release_gate_requires_pinned_model"
