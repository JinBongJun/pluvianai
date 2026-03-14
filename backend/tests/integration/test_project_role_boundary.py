import pytest
from fastapi import status

from app.main import app
from app.core.security import get_current_user, get_password_hash
from app.models.project_member import ProjectMember
from app.models.user import User


def _as_member_user(db, test_project) -> User:
    member = User(
        email="member-role-boundary@example.com",
        hashed_password=get_password_hash("testpassword123"),
        full_name="Member Role Boundary",
        is_active=True,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    db.add(
        ProjectMember(
            project_id=test_project.id,
            user_id=member.id,
            role="member",
        )
    )
    db.commit()
    return member


def _override_current_user(user: User) -> None:
    def _override():
        return user

    app.dependency_overrides[get_current_user] = _override


@pytest.mark.integration
@pytest.mark.asyncio
class TestProjectRoleBoundary:
    async def test_member_cannot_update_or_delete_project(
        self, async_client, auth_headers, db, test_project
    ):
        member = _as_member_user(db, test_project)
        _override_current_user(member)

        update_response = await async_client.patch(
            f"/api/v1/projects/{test_project.id}",
            json={"name": "Should Not Update"},
            headers=auth_headers,
        )
        assert update_response.status_code == status.HTTP_403_FORBIDDEN
        payload_text = str(update_response.json()).lower()
        assert "requires one of" in payload_text
        assert "owner" in payload_text and "admin" in payload_text
        assert "your role is 'member'" in payload_text
        assert "ask a project owner or admin" in payload_text

        delete_response = await async_client.delete(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers,
        )
        assert delete_response.status_code == status.HTTP_403_FORBIDDEN

    async def test_member_cannot_manage_project_members(
        self, async_client, auth_headers, db, test_project, test_user
    ):
        member = _as_member_user(db, test_project)
        _override_current_user(member)

        add_response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/members",
            json={"user_email": test_user.email, "role": "viewer"},
            headers=auth_headers,
        )
        assert add_response.status_code == status.HTTP_403_FORBIDDEN

        patch_response = await async_client.patch(
            f"/api/v1/projects/{test_project.id}/members/{test_user.id}",
            json={"role": "viewer"},
            headers=auth_headers,
        )
        assert patch_response.status_code == status.HTTP_403_FORBIDDEN

        remove_response = await async_client.delete(
            f"/api/v1/projects/{test_project.id}/members/{test_user.id}",
            headers=auth_headers,
        )
        assert remove_response.status_code == status.HTTP_403_FORBIDDEN

    async def test_member_cannot_mutate_live_view_agent_or_saved_logs(
        self, async_client, auth_headers, db, test_project
    ):
        member = _as_member_user(db, test_project)
        _override_current_user(member)
        agent_id = "agent-A"

        patch_settings_response = await async_client.patch(
            f"/api/v1/projects/{test_project.id}/live-view/agents/{agent_id}/settings",
            json={"display_name": "nope"},
            headers=auth_headers,
        )
        assert patch_settings_response.status_code == status.HTTP_403_FORBIDDEN

        delete_agent_response = await async_client.delete(
            f"/api/v1/projects/{test_project.id}/live-view/agents/{agent_id}",
            headers=auth_headers,
        )
        assert delete_agent_response.status_code == status.HTTP_403_FORBIDDEN

        save_logs_response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/live-view/agents/{agent_id}/saved-logs",
            json={"snapshot_ids": [1]},
            headers=auth_headers,
        )
        assert save_logs_response.status_code == status.HTTP_403_FORBIDDEN

        batch_delete_response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/live-view/agents/{agent_id}/saved-logs/batch-delete",
            json={"snapshot_ids": [1]},
            headers=auth_headers,
        )
        assert batch_delete_response.status_code == status.HTTP_403_FORBIDDEN

        clear_saved_response = await async_client.delete(
            f"/api/v1/projects/{test_project.id}/live-view/agents/{agent_id}/saved-logs",
            headers=auth_headers,
        )
        assert clear_saved_response.status_code == status.HTTP_403_FORBIDDEN

    async def test_member_cannot_mutate_user_api_keys_but_can_read(
        self, async_client, auth_headers, db, test_project
    ):
        member = _as_member_user(db, test_project)
        _override_current_user(member)

        create_response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/user-api-keys",
            json={"provider": "openai", "api_key": "sk-test", "name": "test key"},
            headers=auth_headers,
        )
        assert create_response.status_code == status.HTTP_403_FORBIDDEN

        delete_response = await async_client.delete(
            f"/api/v1/projects/{test_project.id}/user-api-keys/1",
            headers=auth_headers,
        )
        assert delete_response.status_code == status.HTTP_403_FORBIDDEN

        read_response = await async_client.get(
            f"/api/v1/projects/{test_project.id}/user-api-keys",
            headers=auth_headers,
        )
        assert read_response.status_code == status.HTTP_200_OK

    async def test_member_cannot_delete_behavior_dataset(
        self, async_client, auth_headers, db, test_project
    ):
        member = _as_member_user(db, test_project)
        _override_current_user(member)

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/behavior-datasets/fake-dataset/delete",
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
