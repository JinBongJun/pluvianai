import pytest
from fastapi import status

from app.models.subscription import Subscription
from app.models.usage import Usage


def _extract_error_code(data: dict) -> str | None:
    detail = data.get("detail") if isinstance(data, dict) else None
    if isinstance(detail, dict):
        return detail.get("error_code") or detail.get("code")
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        details = err.get("details")
        if isinstance(details, dict):
            return details.get("error_code") or details.get("code")
        return err.get("code")
    return None


@pytest.mark.integration
@pytest.mark.asyncio
class TestSuperuserLimitSkip:
    async def test_superuser_can_create_project_even_when_free_project_cap_reached(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        # Precondition: free cap reached (fixture already creates 1 active project, free limit is 1).
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        test_user.is_superuser = True
        db.commit()

        response = await async_client.post(
            "/api/v1/projects",
            json={"name": "superuser-limit-skip-project", "description": "created while over cap"},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data.get("name") == "superuser-limit-skip-project"

    async def test_superuser_is_not_blocked_by_platform_replay_credit_limit(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        # Free cap is 60; seed at cap so non-superusers would be blocked.
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=60,
                unit="credits",
            )
        )
        test_user.is_superuser = True
        db.commit()

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate-async",
            # Missing trace/data may fail later with 400/422, but superuser must bypass credit gate.
            json={"model_source": "platform"},
            headers=auth_headers,
        )

        assert response.status_code in (
            status.HTTP_202_ACCEPTED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
        assert _extract_error_code(response.json()) != "LIMIT_PLATFORM_REPLAY_CREDITS"

    async def test_create_snapshot_passes_superuser_flag_to_limit_guard(
        self, async_client, auth_headers, db, test_user, test_project, monkeypatch
    ):
        from app.api.v1.endpoints import live_view as live_view_endpoint

        observed = {"is_superuser": None}

        def _fake_check_snapshot_limit(_db, _user_id, is_superuser=False):
            observed["is_superuser"] = bool(is_superuser)
            # Allow only when superuser flag is passed.
            return (bool(is_superuser), "blocked")

        monkeypatch.setattr(
            live_view_endpoint,
            "check_snapshot_limit",
            _fake_check_snapshot_limit,
            raising=True,
        )

        test_user.is_superuser = True
        db.commit()

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/snapshots",
            json={"trace_id": "trace-superuser-skip", "provider": "openai", "model": "gpt-4.1-mini", "payload": {}},
            headers=auth_headers,
        )

        assert observed["is_superuser"] is True
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_202_ACCEPTED)
