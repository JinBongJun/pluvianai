import pytest

from app.models.usage import Usage
from app.services.replay_service import ReplayService, _persist_replay_usage
from app.services.providers.capabilities import resolve_capabilities


@pytest.mark.unit
class TestReplayUsagePersistence:
    def test_persist_replay_usage_skips_byok_runs(self, db, test_project):
        _persist_replay_usage(
            db,
            test_project.id,
            results=[{"success": True, "used_credits": 120}],
            track_platform_credits=False,
        )
        db.commit()

        records = db.query(Usage).all()
        assert records == []

    def test_persist_replay_usage_records_only_successful_platform_runs(self, db, test_project):
        _persist_replay_usage(
            db,
            test_project.id,
            results=[
                {"success": True, "used_credits": 120},
                {"success": False, "used_credits": 999},
                {"success": True, "used_credits": 30},
            ],
            track_platform_credits=True,
        )
        db.commit()

        records = db.query(Usage).all()
        assert len(records) == 1
        assert records[0].metric_name == "guard_credits_replay"
        assert records[0].quantity == 150
        assert records[0].project_id == test_project.id
        assert records[0].user_id == test_project.owner_id


@pytest.mark.unit
class TestReplayGooglePayloadFallback:
    def test_build_payload_uses_google_system_instruction_snake_case(self):
        service = ReplayService()
        payload = {
            "messages": [
                {"role": "system", "content": "System prompt here"},
                {"role": "user", "content": "hello"},
            ]
        }

        caps = resolve_capabilities("google", "gemini-2.0-flash")
        assert caps["google_system_instruction_field"] == "system_instruction"

        built = service._build_payload_for_provider(payload, "google", "gemini-2.0-flash")
        assert "system_instruction" in built
        assert "systemInstruction" not in built
        assert built["system_instruction"]["parts"][0]["text"] == "System prompt here"

    def test_google_payload_fallback_variants_include_camel_and_inline(self):
        service = ReplayService()
        payload = {
            "contents": [{"role": "user", "parts": [{"text": "User asks something"}]}],
            "system_instruction": {"parts": [{"text": "System prompt"}]},
            "tools": [{"functionDeclarations": []}],
            "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
        }

        variants = service._google_payload_fallback_variants(payload)
        stages = [stage for stage, _ in variants]
        assert "google_system_instruction_camel" in stages
        assert "google_system_inlined_into_user" in stages
        assert "google_tools_off" in stages

        camel_payload = next(v for s, v in variants if s == "google_system_instruction_camel")
        assert "systemInstruction" in camel_payload
        assert "system_instruction" not in camel_payload

        inline_payload = next(v for s, v in variants if s == "google_system_inlined_into_user")
        assert "system_instruction" not in inline_payload
        assert "systemInstruction" not in inline_payload
        assert "contents" in inline_payload
        first_text = inline_payload["contents"][0]["parts"][0]["text"]
        assert "System prompt" in first_text
        assert "User asks something" in first_text

        tools_off_payload = next(v for s, v in variants if s == "google_tools_off")
        assert "tools" not in tools_off_payload
        assert "toolConfig" not in tools_off_payload

    def test_google_adapter_supports_camel_system_instruction_field(self):
        from app.services.providers.google_adapter import GoogleProviderAdapter

        adapter = GoogleProviderAdapter(
            classify_error=lambda status_code, error_code, message: "payload_schema",
            friendly_error_message=lambda provider, kind, model: "",
        )

        payload = adapter.build_payload(
            system_prompt="System prompt here",
            messages=[{"role": "user", "content": "hello"}],
            knobs={"temperature": None, "top_p": None, "max_tokens": None},
            tool_specs=[],
            tool_choice=None,
            model_for_request="gemini-2.0-flash",
            system_instruction_field="systemInstruction",
        )

        assert "systemInstruction" in payload
        assert "system_instruction" not in payload
        assert payload["systemInstruction"]["parts"][0]["text"] == "System prompt here"
