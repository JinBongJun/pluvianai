"""
Integration tests for current Free-tier limits on Release Gate.

These tests validate that:
1) Hosted platform replay runs are blocked with 403 once monthly hosted credits are exhausted.
2) BYOK/detected path is not blocked by hosted-credit gate (it can still fail later for missing inputs).
"""
import pytest
from fastapi import status

from app.models.subscription import Subscription
from app.models.usage import Usage


def _extract_error_code(data: dict) -> str | None:
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        details = err.get("details")
        if isinstance(details, dict) and details.get("code"):
            return details.get("code")
        if err.get("code"):
            return err.get("code")
    detail = data.get("detail") if isinstance(data, dict) else None
    if isinstance(detail, dict):
        return detail.get("code") or detail.get("error_code")
    return None


@pytest.mark.integration
@pytest.mark.asyncio
class TestReleaseGateFreeTierLimits:
    async def test_platform_replay_credits_limit_returns_403(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        # Free cap is 60 hosted replay credits/month; seed at cap so platform mode is blocked.
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=60,
                unit="credits",
            )
        )
        db.commit()

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate-async",
            json={"model_source": "platform"},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        assert _extract_error_code(data) == "LIMIT_PLATFORM_REPLAY_CREDITS"

    async def test_detected_mode_is_not_blocked_by_platform_credit_gate(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        # Same over-cap setup as platform gate test.
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=60,
                unit="credits",
            )
        )
        db.commit()

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate-async",
            # Missing trace/data is expected to fail later with 400,
            # but must not be blocked by hosted-credit gate.
            json={"model_source": "detected"},
            headers=auth_headers,
        )

        assert response.status_code in (
            status.HTTP_202_ACCEPTED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
        data = response.json()
        assert _extract_error_code(data) != "LIMIT_PLATFORM_REPLAY_CREDITS"
