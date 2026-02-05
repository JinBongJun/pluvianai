"""
Integration tests for plan limit checks on Replay and Regression APIs.
When input_count or estimated_calls exceed plan limits, API returns 403 with detail/code.
"""
import pytest
from fastapi import status

from app.core.subscription_limits import PLAN_LIMITS


@pytest.mark.integration
@pytest.mark.asyncio
class TestReplayTestLimits:
    """Replay POST /replay/{project_id}/run returns 403 when over plan limits."""

    async def test_replay_over_input_limit_returns_403(self, async_client, auth_headers, test_project):
        """Request with snapshot_ids count over input_prompts_per_test returns 403."""
        free_limit = PLAN_LIMITS["free"]["input_prompts_per_test"]
        over_limit_ids = list(range(1, free_limit + 2))  # e.g. 51 for free (50)

        response = await async_client.post(
            f"/api/v1/replay/{test_project.id}/run",
            json={"snapshot_ids": over_limit_ids},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        # Custom handler: {"error": {"code": "...", "message": "user-visible string", "details": {...}}}
        err = data.get("error") or {}
        user_message = err.get("message")
        details = err.get("details")
        assert user_message is not None
        assert "Input limit exceeded" in str(user_message) or "limit" in str(user_message).lower()
        if isinstance(details, dict):
            assert details.get("code") == "LIMIT_INPUTS_PER_TEST"
            assert details.get("limit") == free_limit
            assert details.get("requested") == len(over_limit_ids)
        elif data.get("detail") and isinstance(data["detail"], dict):
            assert data["detail"].get("code") == "LIMIT_INPUTS_PER_TEST"


@pytest.mark.integration
@pytest.mark.asyncio
class TestRegressionTestLimits:
    """Regression POST /projects/{project_id}/regression/test returns 403 when over plan limits."""

    async def test_regression_over_input_limit_returns_403(self, async_client, auth_headers, test_project):
        """Request with test_cases count over input_prompts_per_test returns 403."""
        free_limit = PLAN_LIMITS["free"]["input_prompts_per_test"]
        over_limit_cases = [
            {
                "prompt": f"prompt {i}",
                "response_after": f"response {i}",
            }
            for i in range(free_limit + 1)
        ]

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/regression/test",
            json={
                "test_cases": over_limit_cases,
                "model_before": "gpt-4o-mini",
                "model_after": "gpt-4o-mini",
                "create_review": False,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        err = data.get("error") or {}
        user_message = err.get("message")
        details = err.get("details")
        assert user_message is not None
        assert "Input limit exceeded" in str(user_message) or "limit" in str(user_message).lower()
        if isinstance(details, dict):
            assert details.get("code") == "LIMIT_INPUTS_PER_TEST"
            assert details.get("limit") == free_limit
            assert details.get("requested") == len(over_limit_cases)
        elif data.get("detail") and isinstance(data["detail"], dict):
            assert data["detail"].get("code") == "LIMIT_INPUTS_PER_TEST"
