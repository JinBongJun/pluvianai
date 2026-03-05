"""
Integration tests for RBAC boundary hardening.
"""

import pytest
from fastapi import status

from app.main import app
from app.core.security import get_current_user, get_password_hash
from app.models.user import User
from app.models.project_member import ProjectMember


@pytest.mark.integration
class TestRBACBoundaries:
    def _as_project_member(self, db, test_project) -> User:
        member = User(
            email="member@example.com",
            hashed_password=get_password_hash("testpassword123"),
            full_name="Project Member",
            is_active=True,
        )
        db.add(member)
        db.commit()
        db.refresh(member)

        project_member = ProjectMember(
            project_id=test_project.id,
            user_id=member.id,
            role="member",
        )
        db.add(project_member)
        db.commit()
        return member

    def test_live_view_mutation_forbidden_for_member(self, client, db, test_project):
        member = self._as_project_member(db, test_project)
        app.dependency_overrides[get_current_user] = lambda: member

        response = client.patch(
            f"/api/v1/projects/{test_project.id}/live-view/agents/test-agent/settings",
            params={"display_name": "Member Update"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_project_user_api_key_create_forbidden_for_member(self, client, db, test_project):
        member = self._as_project_member(db, test_project)
        app.dependency_overrides[get_current_user] = lambda: member

        response = client.post(
            f"/api/v1/projects/{test_project.id}/user-api-keys",
            json={
                "provider": "openai",
                "api_key": "sk-test-member-key",
                "name": "member-key",
            },
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_project_user_api_key_delete_forbidden_for_member(self, client, db, test_project):
        member = self._as_project_member(db, test_project)
        app.dependency_overrides[get_current_user] = lambda: member

        response = client.delete(f"/api/v1/projects/{test_project.id}/user-api-keys/1")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_project_user_api_key_list_allowed_for_member(self, client, db, test_project):
        member = self._as_project_member(db, test_project)
        app.dependency_overrides[get_current_user] = lambda: member

        response = client.get(f"/api/v1/projects/{test_project.id}/user-api-keys")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.json(), list)

