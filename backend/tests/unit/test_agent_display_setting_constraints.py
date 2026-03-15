import pytest
from sqlalchemy.exc import IntegrityError

from app.models.agent_display_setting import AgentDisplaySetting
from app.models.project import Project
from app.models.user import User
from app.core.security import get_password_hash


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


@pytest.mark.unit
class TestAgentDisplaySettingConstraints:
    def test_same_hash_allowed_across_projects(self, db):
        owner = _create_user(db, "ads-owner@example.com")
        project_a = _create_project(db, owner.id, "ADS-A")
        project_b = _create_project(db, owner.id, "ADS-B")

        row_a = AgentDisplaySetting(
            project_id=project_a.id,
            system_prompt_hash="same-hash",
            display_name="A",
            node_type="agentCard",
        )
        row_b = AgentDisplaySetting(
            project_id=project_b.id,
            system_prompt_hash="same-hash",
            display_name="B",
            node_type="agentCard",
        )
        db.add(row_a)
        db.add(row_b)
        db.commit()

        assert row_a.id is not None
        assert row_b.id is not None

    def test_same_hash_rejected_within_same_project(self, db):
        owner = _create_user(db, "ads-owner-2@example.com")
        project = _create_project(db, owner.id, "ADS-SAME")

        db.add(
            AgentDisplaySetting(
                project_id=project.id,
                system_prompt_hash="duplicate-hash",
                display_name="first",
                node_type="agentCard",
            )
        )
        db.commit()

        db.add(
            AgentDisplaySetting(
                project_id=project.id,
                system_prompt_hash="duplicate-hash",
                display_name="second",
                node_type="agentCard",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
