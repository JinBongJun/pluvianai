import pytest
from fastapi import status

from app.main import app
from app.core.security import get_current_user, get_password_hash
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.signal_detection import SignalConfig
from app.models.user import User
from app.models.user_api_key import UserApiKey


def _override_current_user(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _create_user(db, email: str) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword123"),
        full_name=email.split("@")[0],
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_project(db, owner_id: int, name: str) -> Project:
    project = Project(name=name, description=name, owner_id=owner_id, is_active=True)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _add_project_member(db, project_id: int, user_id: int, role: str = "member") -> None:
    db.add(ProjectMember(project_id=project_id, user_id=user_id, role=role))
    db.commit()


@pytest.mark.integration
class TestScopeIsolationGuards:
    def test_signal_config_update_delete_blocked_cross_project(self, client, db, auth_headers, test_user):
        owner_b = _create_user(db, "scope-owner-b@example.com")
        project_b = _create_project(db, owner_b.id, "Project B")
        config_b = SignalConfig(
            project_id=project_b.id,
            signal_type="length_change",
            name="pB-config",
            params={"threshold_ratio": 0.5},
            severity="medium",
            enabled=True,
        )
        db.add(config_b)
        db.commit()
        db.refresh(config_b)

        _override_current_user(test_user)

        update_response = client.put(
            f"/api/v1/signals/configs/{config_b.id}",
            json={"name": "hacked"},
            headers=auth_headers,
        )
        assert update_response.status_code == status.HTTP_403_FORBIDDEN

        delete_response = client.delete(
            f"/api/v1/signals/configs/{config_b.id}",
            headers=auth_headers,
        )
        assert delete_response.status_code == status.HTTP_403_FORBIDDEN

    def test_user_api_key_delete_requires_same_project_scope(self, client, db, auth_headers, test_user, test_project):
        project_b = _create_project(db, test_user.id, "Project B for Keys")
        key_in_project_b = UserApiKey(
            project_id=project_b.id,
            user_id=test_user.id,
            provider="openai",
            encrypted_key="encrypted-value",
            name="project-b-key",
            is_active=True,
        )
        db.add(key_in_project_b)
        db.commit()
        db.refresh(key_in_project_b)

        _override_current_user(test_user)

        response = client.delete(
            f"/api/v1/projects/{test_project.id}/user-api-keys/{key_in_project_b.id}",
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

        db.refresh(key_in_project_b)
        assert key_in_project_b.is_active is True

    def test_signal_config_mutation_forbidden_for_member_role(self, client, db, auth_headers):
        owner = _create_user(db, "signal-owner@example.com")
        member = _create_user(db, "signal-member@example.com")
        owner_project = _create_project(db, owner.id, "Owner Signal Project")
        _add_project_member(db, owner_project.id, member.id, role="member")

        config = SignalConfig(
            project_id=owner_project.id,
            signal_type="length_change",
            name="owner-config",
            params={"threshold_ratio": 0.1},
            severity="medium",
            enabled=True,
        )
        db.add(config)
        db.commit()
        db.refresh(config)

        _override_current_user(member)

        update_response = client.put(
            f"/api/v1/signals/configs/{config.id}",
            json={"name": "member-update"},
            headers=auth_headers,
        )
        assert update_response.status_code == status.HTTP_403_FORBIDDEN
