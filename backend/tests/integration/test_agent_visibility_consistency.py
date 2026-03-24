from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi import status

from app.models.agent_display_setting import AgentDisplaySetting
from app.models.agent_eval_config_history import AgentEvalConfigHistory
from app.models.saved_log import SavedLog
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.models.trajectory_step import TrajectoryStep
from app.models.user_api_key import UserApiKey


@pytest.mark.integration
@pytest.mark.asyncio
class TestAgentVisibilityConsistency:
    async def test_release_gate_agent_list_respects_shared_visibility_rules(
        self, async_client, auth_headers, test_project, db
    ):
        deleted_agent_id = "agent-deleted"
        visible_agent_id = "agent-visible"
        blueprint_only_agent_id = "agent-blueprint-only"

        # Include a blueprint-only node and a deleted node.
        test_project.canvas_nodes = [
            {"id": deleted_agent_id, "type": "agentCard", "data": {"label": "Deleted Agent"}},
            {"id": visible_agent_id, "type": "agentCard", "data": {"label": "Visible Agent"}},
            {"id": blueprint_only_agent_id, "type": "agentCard", "data": {"label": "Blueprint Agent"}},
        ]
        db.add(test_project)

        trace = Trace(id="trace-agent-visibility", project_id=test_project.id)
        db.add(trace)
        db.flush()

        db.add_all(
            [
                Snapshot(
                    project_id=test_project.id,
                    trace_id=trace.id,
                    agent_id=deleted_agent_id,
                    provider="openai",
                    model="gpt-4o-mini",
                    payload={},
                    system_prompt="sys",
                    user_message="hi",
                    response="ok",
                    status_code=200,
                ),
                Snapshot(
                    project_id=test_project.id,
                    trace_id=trace.id,
                    agent_id=visible_agent_id,
                    provider="openai",
                    model="gpt-4o-mini",
                    payload={},
                    system_prompt="sys",
                    user_message="hi",
                    response="ok",
                    status_code=200,
                ),
                AgentDisplaySetting(
                    project_id=test_project.id,
                    system_prompt_hash=deleted_agent_id,
                    display_name="Deleted Agent",
                    is_deleted=True,
                ),
            ]
        )
        db.commit()

        rg_res = await async_client.get(
            f"/api/v1/projects/{test_project.id}/release-gate/agents",
            headers=auth_headers,
        )
        assert rg_res.status_code == status.HTTP_200_OK

        rg_ids = {a["agent_id"] for a in rg_res.json().get("items", [])}
        assert deleted_agent_id not in rg_ids
        assert visible_agent_id in rg_ids
        assert blueprint_only_agent_id in rg_ids

    async def test_restore_endpoint_reactivates_deleted_agent(
        self, async_client, auth_headers, test_project, db
    ):
        agent_id = "agent-restore"
        db.add(
            AgentDisplaySetting(
                project_id=test_project.id,
                system_prompt_hash=agent_id,
                display_name="Restore Me",
                is_deleted=True,
                deleted_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        res = await async_client.post(
            f"/api/v1/projects/{test_project.id}/live-view/agents/{agent_id}/restore",
            headers=auth_headers,
        )

        assert res.status_code == status.HTTP_200_OK
        payload = res.json()
        assert payload["agent_id"] == agent_id
        assert payload["is_deleted"] is False

        db.expire_all()
        setting = (
            db.query(AgentDisplaySetting)
            .filter(AgentDisplaySetting.project_id == test_project.id)
            .filter(AgentDisplaySetting.system_prompt_hash == agent_id)
            .first()
        )
        assert setting is not None
        assert setting.is_deleted is False
        assert setting.deleted_at is None

    async def test_new_snapshot_auto_restores_recently_deleted_agent(
        self, async_client, auth_headers, test_project, db
    ):
        agent_id = "agent-auto-restore"
        trace = Trace(id="trace-auto-restore", project_id=test_project.id)
        db.add(trace)
        db.add(
            AgentDisplaySetting(
                project_id=test_project.id,
                system_prompt_hash=agent_id,
                is_deleted=True,
                deleted_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        with patch("app.services.cache_service.cache_service.enabled", False):
            res = await async_client.post(
                f"/api/v1/projects/{test_project.id}/snapshots",
                headers=auth_headers,
                json={
                    "trace_id": trace.id,
                    "agent_id": agent_id,
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "payload": {
                        "messages": [
                            {"role": "system", "content": "You are a support bot."},
                            {"role": "user", "content": "hello"},
                        ],
                        "response": "hi there",
                    },
                },
            )

        assert res.status_code == status.HTTP_200_OK

        db.expire_all()
        setting = (
            db.query(AgentDisplaySetting)
            .filter(AgentDisplaySetting.project_id == test_project.id)
            .filter(AgentDisplaySetting.system_prompt_hash == agent_id)
            .first()
        )
        assert setting is not None
        assert setting.is_deleted is False
        assert setting.deleted_at is None

    async def test_hard_delete_purges_agent_data_and_keeps_agent_hidden(
        self, async_client, auth_headers, test_project, test_user, db
    ):
        agent_id = "agent-hard-delete"
        test_project.canvas_nodes = [
            {"id": agent_id, "type": "agentCard", "data": {"label": "Hard Delete Agent"}},
        ]
        db.add(test_project)

        trace = Trace(id="trace-hard-delete", project_id=test_project.id)
        db.add(trace)
        db.flush()

        snapshot = Snapshot(
            project_id=test_project.id,
            trace_id=trace.id,
            agent_id=agent_id,
            provider="openai",
            model="gpt-4o-mini",
            payload={},
            system_prompt="sys",
            user_message="hi",
            response="ok",
            status_code=200,
        )
        db.add(snapshot)
        db.flush()

        db.add_all(
            [
                SavedLog(project_id=test_project.id, agent_id=agent_id, snapshot_id=snapshot.id),
                AgentEvalConfigHistory(
                    project_id=test_project.id,
                    agent_id=agent_id,
                    effective_from=datetime.now(timezone.utc),
                    eval_config={"eval": {"latency": {"enabled": True}}},
                ),
                TrajectoryStep(
                    project_id=test_project.id,
                    trace_id=trace.id,
                    step_order=1,
                    step_type="llm_call",
                    agent_id=agent_id,
                    source_type="snapshot",
                    source_id=str(snapshot.id),
                ),
                UserApiKey(
                    project_id=test_project.id,
                    user_id=test_user.id,
                    agent_id=agent_id,
                    provider="openai",
                    encrypted_key="encrypted",
                    key_hint="sk-...1234",
                    is_active=True,
                ),
                AgentDisplaySetting(
                    project_id=test_project.id,
                    system_prompt_hash=agent_id,
                    display_name="Delete Me",
                    is_deleted=True,
                    deleted_at=datetime.now(timezone.utc),
                ),
            ]
        )
        db.commit()

        res = await async_client.post(
            f"/api/v1/projects/{test_project.id}/live-view/agents/hard-delete",
            headers=auth_headers,
            json={"agent_ids": [agent_id]},
        )
        assert res.status_code == status.HTTP_200_OK
        payload = res.json()
        assert payload["deleted_agent_settings"] == 1
        assert payload["deleted_snapshots"] == 1
        assert payload["deleted_saved_logs"] >= 1
        assert payload["deleted_trajectory_steps"] >= 1
        assert payload["deleted_agent_eval_history"] == 1
        assert payload["deleted_user_api_keys"] == 1

        db.expire_all()
        setting = (
            db.query(AgentDisplaySetting)
            .filter(AgentDisplaySetting.project_id == test_project.id)
            .filter(AgentDisplaySetting.system_prompt_hash == agent_id)
            .first()
        )
        assert setting is not None
        assert setting.is_deleted is False
        assert setting.deleted_at is not None
        assert db.query(Snapshot).filter(Snapshot.project_id == test_project.id, Snapshot.agent_id == agent_id).count() == 0
        assert db.query(SavedLog).filter(SavedLog.project_id == test_project.id, SavedLog.agent_id == agent_id).count() == 0
        assert (
            db.query(AgentEvalConfigHistory)
            .filter(AgentEvalConfigHistory.project_id == test_project.id, AgentEvalConfigHistory.agent_id == agent_id)
            .count()
            == 0
        )
        assert (
            db.query(TrajectoryStep)
            .filter(TrajectoryStep.project_id == test_project.id, TrajectoryStep.agent_id == agent_id)
            .count()
            == 0
        )
        assert (
            db.query(UserApiKey)
            .filter(UserApiKey.project_id == test_project.id, UserApiKey.agent_id == agent_id)
            .count()
            == 0
        )

        rg_res = await async_client.get(
            f"/api/v1/projects/{test_project.id}/release-gate/agents",
            headers=auth_headers,
        )
        assert rg_res.status_code == status.HTTP_200_OK
        rg_ids = {a["agent_id"] for a in rg_res.json().get("items", [])}
        assert agent_id not in rg_ids

    async def test_restore_endpoint_rejects_hard_deleted_agent(
        self, async_client, auth_headers, test_project, db
    ):
        agent_id = "agent-hard-deleted-restore"
        db.add(
            AgentDisplaySetting(
                project_id=test_project.id,
                system_prompt_hash=agent_id,
                display_name="Gone",
                is_deleted=False,
                deleted_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        res = await async_client.post(
            f"/api/v1/projects/{test_project.id}/live-view/agents/{agent_id}/restore",
            headers=auth_headers,
        )
        assert res.status_code == status.HTTP_410_GONE

