from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import live_view
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.agent_eval_config_history import AgentEvalConfigHistory


def _mock_db_with_setting(setting):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = setting
    return db


@pytest.mark.unit
def test_update_agent_settings_create_records_eval_history():
    db = _mock_db_with_setting(None)
    current_user = MagicMock()

    with patch.object(live_view, "_ensure_project", return_value=MagicMock()):
        live_view.update_agent_settings(
            project_id=1,
            agent_id="agent-create",
            diagnostic_config={"eval": {"enabled": True, "empty": {"enabled": True, "min_chars": 10}}},
            db=db,
            current_user=current_user,
        )

    added_objs = [args[0][0] for args in db.add.call_args_list]
    history_rows = [obj for obj in added_objs if isinstance(obj, AgentEvalConfigHistory)]
    settings_rows = [obj for obj in added_objs if isinstance(obj, AgentDisplaySetting)]

    assert len(settings_rows) == 1
    assert len(history_rows) == 1
    assert history_rows[0].agent_id == "agent-create"
    assert history_rows[0].project_id == 1
    db.commit.assert_called_once()


@pytest.mark.unit
def test_update_agent_settings_update_records_eval_history():
    existing = AgentDisplaySetting(
        id="s1",
        project_id=1,
        system_prompt_hash="agent-update",
        diagnostic_config={"eval": {"enabled": True, "empty": {"enabled": True, "min_chars": 8}}},
    )
    db = _mock_db_with_setting(existing)
    current_user = MagicMock()

    with patch.object(live_view, "_ensure_project", return_value=MagicMock()):
        live_view.update_agent_settings(
            project_id=1,
            agent_id="agent-update",
            diagnostic_config={"eval": {"enabled": False}},
            db=db,
            current_user=current_user,
        )

    added_objs = [args[0][0] for args in db.add.call_args_list]
    history_rows = [obj for obj in added_objs if isinstance(obj, AgentEvalConfigHistory)]
    assert len(history_rows) == 1
    assert history_rows[0].agent_id == "agent-update"
    # latest merged setting should be normalized and include the new top-level enabled flag
    assert history_rows[0].eval_config.get("enabled") is False


@pytest.mark.unit
def test_update_agent_settings_rejects_non_object_diagnostic_config():
    db = _mock_db_with_setting(None)
    current_user = MagicMock()

    with patch.object(live_view, "_ensure_project", return_value=MagicMock()):
        with pytest.raises(HTTPException) as exc:
            live_view.update_agent_settings(
                project_id=1,
                agent_id="agent-bad",
                diagnostic_config="not-a-json-object",
                db=db,
                current_user=current_user,
            )

    assert exc.value.status_code == 422
    assert "diagnostic_config must be a JSON object" in str(exc.value.detail)
