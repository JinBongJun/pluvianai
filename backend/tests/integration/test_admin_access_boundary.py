import pytest
from fastapi import status


@pytest.mark.integration
@pytest.mark.asyncio
class TestAdminAccessBoundary:
    async def test_non_superuser_cannot_access_admin_read_endpoints(
        self, async_client, auth_headers, test_project
    ):
        read_paths = [
            "/api/v1/admin/stats",
            "/api/v1/admin/users",
            "/api/v1/internal/usage/credits/by-project?month=2026-03",
        ]

        for path in read_paths:
            response = await async_client.get(path, headers=auth_headers)
            assert response.status_code == status.HTTP_403_FORBIDDEN, f"Expected 403 for GET {path}"

    async def test_non_superuser_cannot_execute_admin_mutations(
        self, async_client, auth_headers, test_project, test_user
    ):
        mutation_calls = [
            (
                "post",
                "/api/v1/admin/ops-alerts/test",
                {
                    "event_type": "release_gate_failure_burst",
                    "project_id": test_project.id,
                    "repeats": 3,
                },
            ),
        ]

        for call in mutation_calls:
            if len(call) == 2:
                method, path = call
                response = await getattr(async_client, method)(path, headers=auth_headers)
            else:
                method, path, payload = call
                response = await getattr(async_client, method)(path, headers=auth_headers, json=payload)
            assert response.status_code == status.HTTP_403_FORBIDDEN, f"Expected 403 for {method.upper()} {path}"
