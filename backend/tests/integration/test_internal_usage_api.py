import pytest
from fastapi import status

from app.models.usage import Usage


@pytest.mark.integration
@pytest.mark.asyncio
class TestInternalUsageAPI:
    async def test_release_gate_attempts_by_project_aggregates_attempts_and_run_rows(
        self, async_client, superuser_auth_headers, db, test_user, test_project
    ):
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

        response = await async_client.get(
            "/api/v1/internal/usage/attempts/by-project",
            params={"month": "2026-03"},
            headers=superuser_auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["month"] == "2026-03"
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["project_id"] == test_project.id
        assert item["total_attempts"] == 20
        assert item["runs"] == 2
