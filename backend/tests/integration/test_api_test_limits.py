"""
Integration tests for current Free-tier Release Gate usage limits.

These tests validate that replay attempts are counted regardless of model source.
"""
import pytest
from fastapi import status

from app.models.snapshot import Snapshot
from app.models.subscription import Subscription
from app.models.trace import Trace
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
    async def test_release_gate_attempt_limit_returns_403_for_platform_mode(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        trace = Trace(id="rg-limit-platform-trace", project_id=test_project.id)
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
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="release_gate_attempts",
                quantity=60,
                unit="count",
            )
        )
        db.commit()

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate-async",
            json={
                "trace_id": trace.id,
                "model_source": "platform",
                "replay_provider": "openai",
                "new_model": "gpt-4.1-mini",
                "repeat_runs": 1,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        assert _extract_error_code(data) == "LIMIT_RELEASE_GATE_ATTEMPTS"

    async def test_release_gate_attempt_limit_returns_403_for_detected_mode(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        trace = Trace(id="rg-limit-detected-trace", project_id=test_project.id)
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
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="release_gate_attempts",
                quantity=60,
                unit="count",
            )
        )
        db.commit()

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate-async",
            json={"trace_id": trace.id, "model_source": "detected", "repeat_runs": 1},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        assert _extract_error_code(data) == "LIMIT_RELEASE_GATE_ATTEMPTS"
