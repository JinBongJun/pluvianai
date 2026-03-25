import pytest
from fastapi import status

from app.models.release_gate_job import ReleaseGateJob


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
