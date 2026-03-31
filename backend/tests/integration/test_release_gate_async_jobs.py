import pytest
from fastapi import status

from app.api.v1.endpoints import release_gate as release_gate_module
from app.models.release_gate_job import ReleaseGateJob
from app.models.snapshot import Snapshot
from app.models.trace import Trace


@pytest.mark.integration
@pytest.mark.asyncio
class TestReleaseGateAsyncJobs:
    async def test_validate_async_reuses_existing_active_job(
        self, async_client, auth_headers, db, test_project, test_user
    ):
        existing = ReleaseGateJob(
            project_id=test_project.id,
            user_id=test_user.id,
            status="queued",
            progress_done=0,
            progress_total=3,
            progress_phase="replay",
            request_json={"evaluation_mode": "replay_test", "repeat_runs": 3},
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate-async",
            json={},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
        body = response.json()
        assert body["job"]["id"] == str(existing.id)
        assert body["job"]["status"] == "queued"

        jobs = (
            db.query(ReleaseGateJob)
            .filter(
                ReleaseGateJob.project_id == test_project.id,
                ReleaseGateJob.user_id == test_user.id,
            )
            .all()
        )
        assert len(jobs) == 1

    async def test_validate_async_returns_hosted_model_not_allowed_for_non_hosted_platform_model(
        self, async_client, auth_headers, test_user, test_project, monkeypatch
    ):
        """Platform mode must use hosted quick-pick models unless superuser / RELEASE_GATE_ALLOW_CUSTOM_MODELS."""
        monkeypatch.setattr(
            release_gate_module.app_settings,
            "RELEASE_GATE_ALLOW_CUSTOM_MODELS",
            False,
            raising=False,
        )
        test_user.is_superuser = False

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate-async",
            json={
                "model_source": "platform",
                "replay_provider": "openai",
                "new_model": "gpt-4o",
                "repeat_runs": 3,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        body = response.json()
        err = body.get("error") if isinstance(body, dict) else None
        details = err.get("details") if isinstance(err, dict) else None
        assert isinstance(details, dict)
        assert details.get("error_code") == "HOSTED_MODEL_NOT_ALLOWED"

    async def test_validate_async_superuser_bypasses_hosted_model_allowlist(
        self, async_client, auth_headers, test_user, test_project, db, monkeypatch
    ):
        monkeypatch.setattr(
            release_gate_module.app_settings,
            "RELEASE_GATE_ALLOW_CUSTOM_MODELS",
            False,
            raising=False,
        )
        test_user.is_superuser = True
        trace = Trace(id="rg-async-superuser-trace", project_id=test_project.id)
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
        db.commit()

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate-async",
            json={
                "trace_id": trace.id,
                "model_source": "platform",
                "replay_provider": "openai",
                "new_model": "gpt-4o",
                "repeat_runs": 3,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
