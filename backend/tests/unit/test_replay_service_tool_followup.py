import pytest


@pytest.mark.unit
class TestReplayServiceNativeToolFollowup:
    def test_openai_followup_payload_uses_tool_role(self):
        from app.services.replay_service import ReplayService

        service = ReplayService()
        payload = service._build_openai_followup_payload_native(
            model_for_request="gpt-4.1-mini",
            system_prompt="System",
            conversation_messages=[{"role": "user", "content": "Hello"}],
            tool_calls=[{"id": "call_1", "name": "get_weather", "arguments": {"city": "Seoul"}}],
            tool_result_text_by_id={"call_1": "sunny"},
            base_tool_defs=[],
            knobs_from_request={"temperature": 0.2, "max_tokens": 256},
        )

        assert payload["messages"][-2]["role"] == "assistant"
        assert payload["messages"][-2]["tool_calls"][0]["id"] == "call_1"
        assert payload["messages"][-1]["role"] == "tool"
        assert payload["messages"][-1]["tool_call_id"] == "call_1"
        assert payload["messages"][-1]["content"] == "sunny"

    def test_anthropic_followup_payload_uses_tool_use_and_tool_result_blocks(self):
        from app.services.replay_service import ReplayService

        service = ReplayService()
        payload = service._build_anthropic_followup_payload_native(
            model_for_request="claude-sonnet-4-20250514",
            system_prompt="System",
            conversation_messages=[{"role": "user", "content": "Hello"}],
            tool_calls=[{"id": "toolu_1", "name": "get_weather", "arguments": {"city": "Seoul"}}],
            tool_result_text_by_id={"toolu_1": "sunny"},
            base_tool_defs=[],
            knobs_from_request={"max_tokens": 256},
        )

        assert payload["messages"][-2]["role"] == "assistant"
        assert payload["messages"][-2]["content"][0]["type"] == "tool_use"
        assert payload["messages"][-2]["content"][0]["id"] == "toolu_1"
        assert payload["messages"][-1]["role"] == "user"
        assert payload["messages"][-1]["content"][0]["type"] == "tool_result"
        assert payload["messages"][-1]["content"][0]["tool_use_id"] == "toolu_1"

    def test_google_adapter_preserves_structured_parts(self):
        from app.services.providers.google_adapter import GoogleProviderAdapter

        adapter = GoogleProviderAdapter(
            classify_error=lambda *_args, **_kwargs: "provider_error",
            friendly_error_message=lambda *_args, **_kwargs: "error",
        )
        payload = adapter.build_payload(
            system_prompt="System",
            messages=[
                {"role": "assistant", "content": [{"functionCall": {"name": "get_weather", "args": {"city": "Seoul"}}}]},
                {"role": "user", "content": [{"functionResponse": {"name": "get_weather", "response": {"content": {"result": "sunny"}}}}]},
            ],
            knobs={},
            tool_specs=[],
            tool_choice=None,
            model_for_request="gemini-2.5-flash",
        )

        assert payload["contents"][0]["parts"][0]["functionCall"]["name"] == "get_weather"
        assert payload["contents"][1]["parts"][0]["functionResponse"]["name"] == "get_weather"

    def test_recorded_tool_result_map_from_ingest_tool_events(self):
        from app.services.replay_service import ReplayService
        from app.models.snapshot import Snapshot

        snap = Snapshot()
        snap.payload = {
            "tool_events": [
                {
                    "kind": "tool_result",
                    "name": "get_weather",
                    "call_id": "call_1",
                    "output": {"temp_c": 22},
                }
            ]
        }
        svc = ReplayService()
        m = svc._recorded_tool_result_map_from_snapshot(snap)
        assert "call_1" in m
        assert "22" in m["call_1"]
        assert "temp_c" in m["call_1"]

    def test_recorded_tool_result_lookups_name_queue_without_call_id(self):
        from app.services.replay_service import ReplayService
        from app.models.snapshot import Snapshot
        from app.utils.tool_calls import normalize_tool_name

        snap = Snapshot()
        snap.payload = {
            "tool_events": [
                {"kind": "tool_result", "name": "get_weather", "output": {"temp_c": 3}},
            ]
        }
        svc = ReplayService()
        by_id, queues = svc._recorded_tool_result_lookups_from_snapshot(snap)
        assert by_id == {}
        key = normalize_tool_name("get_weather")
        assert key in queues
        assert len(queues[key]) == 1
        assert "3" in queues[key][0]
