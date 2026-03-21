from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.domain.live_view_release_gate import restore_agent_if_soft_deleted
from app.models.agent_display_setting import AgentDisplaySetting


@pytest.mark.unit
def test_restore_agent_if_soft_deleted_restores_recent_row(db, test_project):
    setting = AgentDisplaySetting(
        project_id=test_project.id,
        system_prompt_hash="agent-recent",
        is_deleted=True,
        deleted_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db.add(setting)
    db.commit()

    restored = restore_agent_if_soft_deleted(db, test_project.id, "agent-recent")
    db.commit()
    db.refresh(setting)

    assert restored is True
    assert setting.is_deleted is False
    assert setting.deleted_at is None


@pytest.mark.unit
def test_restore_agent_if_soft_deleted_keeps_expired_row_deleted(db, test_project):
    setting = AgentDisplaySetting(
        project_id=test_project.id,
        system_prompt_hash="agent-old",
        is_deleted=True,
        deleted_at=datetime.now(timezone.utc) - timedelta(days=45),
    )
    db.add(setting)
    db.commit()

    with patch("app.domain.live_view_release_gate.agent_visibility.settings.AGENT_AUTO_RESTORE_DAYS", 30):
        restored = restore_agent_if_soft_deleted(db, test_project.id, "agent-old")

    db.refresh(setting)
    assert restored is False
    assert setting.is_deleted is True
    assert setting.deleted_at is not None
