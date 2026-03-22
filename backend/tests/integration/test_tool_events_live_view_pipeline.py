import asyncio
import threading
from typing import Any, Dict

import pytest
from fastapi import status
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints import api_calls as api_calls_endpoint
from app.models.snapshot import Snapshot
from app.models.trajectory_step import TrajectoryStep
from app.services import background_tasks as background_tasks_module


def _tool_event_body(project_id: int, chain_id: str) -> Dict[str, Any]:
    return {
        "project_id": project_id,
        "request_data": {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "What is the weather in Seoul?"}],
        },
        "response_data": {
            "id": f"resp-{chain_id}",
            "model": "gpt-4o-mini",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Let me check the weather tool.",
                        "tool_calls": [
                            {
                                "id": "call_weather_1",
                                "function": {
                                    "name": "get_weather",
                                    "arguments": {"city": "Seoul"},
                                },
                            }
                        ],
                    }
                }
            ],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20},
        },
        "latency_ms": 321,
        "status_code": 200,
        "agent_name": "weather-agent",
        "chain_id": chain_id,
        "tool_events": [
            {
                "kind": "tool_call",
                "name": "get_weather",
                "call_id": "call_weather_1",
                "input": {"city": "Seoul"},
            },
            {
                "kind": "tool_result",
                "name": "get_weather",
                "call_id": "call_weather_1",
                "output": {"temp_c": 22, "condition": "sunny"},
                "status": "ok",
            },
            {
                "kind": "action",
                "name": "send_slack",
                "output": {"ok": True, "channel": "#ops"},
                "status": "ok",
            },
        ],
    }


async def _wait_for_snapshot(test_session_factory, project_id: int, trace_id: str) -> Snapshot:
    for _ in range(40):
        with test_session_factory() as session:
            snap = (
                session.query(Snapshot)
                .filter(Snapshot.project_id == project_id, Snapshot.trace_id == trace_id)
                .order_by(Snapshot.id.desc())
                .first()
            )
            if snap is not None:
                session.expunge(snap)
                return snap
        await asyncio.sleep(0.05)
    raise AssertionError(f"Snapshot was not created for trace_id={trace_id}")


def _run_coro_inline_in_thread(coro):
    done = {"error": None}

    def _runner():
        try:
            asyncio.run(coro)
        except Exception as exc:  # pragma: no cover - surfaced by assertions in the test
            done["error"] = exc

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if done["error"] is not None:
        raise done["error"]
    return None


@pytest.mark.integration
@pytest.mark.asyncio
class TestToolEventsLiveViewPipeline:
    async def test_ingest_tool_events_flow_populates_snapshot_payload_and_detail_timeline(
        self, async_client, auth_headers, db, test_project, monkeypatch
    ):
        test_session_factory = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=db.get_bind(),
        )
        monkeypatch.setattr(
            background_tasks_module,
            "SessionLocal",
            test_session_factory,
            raising=True,
        )
        monkeypatch.setattr(
            background_tasks_module,
            "publish_agents_changed",
            lambda *_args, **_kwargs: None,
            raising=True,
        )
        monkeypatch.setattr(api_calls_endpoint.cache_service, "enabled", False, raising=True)
        monkeypatch.setattr(
            api_calls_endpoint.asyncio,
            "create_task",
            _run_coro_inline_in_thread,
            raising=True,
        )

        trace_id = "trace-tool-events-payload"
        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/api-calls",
            json=_tool_event_body(test_project.id, trace_id),
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
        assert response.json()["accepted"] is True

        snapshot = await _wait_for_snapshot(test_session_factory, test_project.id, trace_id)
        assert snapshot.payload["tool_events"][0]["kind"] == "tool_call"
        assert snapshot.payload["tool_events"][1]["kind"] == "tool_result"
        assert snapshot.payload["tool_events"][2]["kind"] == "action"
        assert snapshot.tool_calls_summary[0]["name"] == "get_weather"

        detail_response = await async_client.get(
            f"/api/v1/projects/{test_project.id}/snapshots/{snapshot.id}",
            headers=auth_headers,
        )

        assert detail_response.status_code == status.HTTP_200_OK
        detail = detail_response.json()
        assert detail["tool_calls_summary"][0]["name"] == "get_weather"
        assert [row["step_type"] for row in detail["tool_timeline"]] == [
            "tool_call",
            "tool_result",
            "action",
        ]
        assert {row["provenance"] for row in detail["tool_timeline"]} == {"payload"}
        assert detail["tool_timeline"][0]["tool_args"]["city"] == "Seoul"
        assert detail["tool_timeline"][1]["tool_result"]["output"]["temp_c"] == 22
        assert detail["tool_timeline"][2]["tool_result"]["output"]["channel"] == "#ops"

    async def test_behavior_validate_persists_trajectory_steps_and_detail_prefers_trajectory(
        self, async_client, auth_headers, db, test_project, monkeypatch
    ):
        test_session_factory = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=db.get_bind(),
        )
        monkeypatch.setattr(
            background_tasks_module,
            "SessionLocal",
            test_session_factory,
            raising=True,
        )
        monkeypatch.setattr(
            background_tasks_module,
            "publish_agents_changed",
            lambda *_args, **_kwargs: None,
            raising=True,
        )
        monkeypatch.setattr(api_calls_endpoint.cache_service, "enabled", False, raising=True)
        monkeypatch.setattr(
            api_calls_endpoint.asyncio,
            "create_task",
            _run_coro_inline_in_thread,
            raising=True,
        )

        trace_id = "trace-tool-events-trajectory"
        ingest_response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/api-calls",
            json=_tool_event_body(test_project.id, trace_id),
            headers=auth_headers,
        )
        assert ingest_response.status_code == status.HTTP_202_ACCEPTED

        snapshot = await _wait_for_snapshot(test_session_factory, test_project.id, trace_id)

        validate_response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/behavior/validate",
            json={"trace_id": trace_id},
            headers=auth_headers,
        )

        assert validate_response.status_code == status.HTTP_200_OK

        with test_session_factory() as session:
            rows = (
                session.query(TrajectoryStep)
                .filter(
                    TrajectoryStep.project_id == test_project.id,
                    TrajectoryStep.trace_id == trace_id,
                    TrajectoryStep.source_id == str(snapshot.id),
                )
                .order_by(TrajectoryStep.step_order.asc())
                .all()
            )

        tool_rows = [row for row in rows if row.step_type in ("tool_call", "tool_result", "action")]
        step_types = [row.step_type for row in tool_rows]
        assert step_types.count("tool_call") >= 1
        assert step_types.count("tool_result") == 1
        assert step_types.count("action") == 1
        payload_tool_call = next(
            row for row in tool_rows if row.step_type == "tool_call" and row.tool_args.get("call_id") == "call_weather_1"
        )
        tool_result_row = next(row for row in tool_rows if row.step_type == "tool_result")
        action_row = next(row for row in tool_rows if row.step_type == "action")
        assert payload_tool_call.tool_args["city"] == "Seoul"
        assert tool_result_row.tool_result["source"] == "ingest_tool_events"
        assert action_row.tool_result["kind"] == "action"

        detail_response = await async_client.get(
            f"/api/v1/projects/{test_project.id}/snapshots/{snapshot.id}",
            headers=auth_headers,
        )
        assert detail_response.status_code == status.HTTP_200_OK

        detail = detail_response.json()
        assert {row["provenance"] for row in detail["tool_timeline"]} == {"trajectory"}
        detail_tool_rows = detail["tool_timeline"]
        assert sum(1 for row in detail_tool_rows if row["step_type"] == "tool_call") >= 1
        assert sum(1 for row in detail_tool_rows if row["step_type"] == "tool_result") == 1
        assert sum(1 for row in detail_tool_rows if row["step_type"] == "action") == 1
        detail_tool_result = next(row for row in detail_tool_rows if row["step_type"] == "tool_result")
        assert detail_tool_result["tool_result"]["source"] == "ingest_tool_events"
        assert detail_tool_result["tool_result"]["output"]["temp_c"] == 22

    async def test_snapshot_detail_safely_degrades_when_tool_events_are_absent(
        self, async_client, auth_headers, db, test_project, monkeypatch
    ):
        test_session_factory = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=db.get_bind(),
        )
        monkeypatch.setattr(
            background_tasks_module,
            "SessionLocal",
            test_session_factory,
            raising=True,
        )
        monkeypatch.setattr(
            background_tasks_module,
            "publish_agents_changed",
            lambda *_args, **_kwargs: None,
            raising=True,
        )
        monkeypatch.setattr(api_calls_endpoint.cache_service, "enabled", False, raising=True)
        monkeypatch.setattr(
            api_calls_endpoint.asyncio,
            "create_task",
            _run_coro_inline_in_thread,
            raising=True,
        )

        trace_id = "trace-tool-events-legacy"
        body = _tool_event_body(test_project.id, trace_id)
        body.pop("tool_events")
        body["response_data"] = {
            "id": f"resp-{trace_id}",
            "model": "gpt-4o-mini",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "No external tools were used for this answer.",
                    }
                }
            ],
        }

        ingest_response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/api-calls",
            json=body,
            headers=auth_headers,
        )
        assert ingest_response.status_code == status.HTTP_202_ACCEPTED

        snapshot = await _wait_for_snapshot(test_session_factory, test_project.id, trace_id)

        detail_response = await async_client.get(
            f"/api/v1/projects/{test_project.id}/snapshots/{snapshot.id}",
            headers=auth_headers,
        )
        assert detail_response.status_code == status.HTTP_200_OK

        detail = detail_response.json()
        assert detail["tool_timeline"] == []
        assert detail["tool_calls_summary"] == []
        assert detail["has_tool_calls"] is False
