import pytest
from fastapi import status

from app.models.agent_display_setting import AgentDisplaySetting
from app.models.snapshot import Snapshot
from app.models.trace import Trace


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

