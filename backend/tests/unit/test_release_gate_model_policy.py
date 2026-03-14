import pytest


@pytest.mark.unit
class TestReleaseGatePinnedModelPolicy:
    def test_is_pinned_anthropic_model_id(self):
        from app.api.v1.endpoints.release_gate import _is_pinned_anthropic_model_id

        assert _is_pinned_anthropic_model_id("claude-sonnet-4-20250514") is True
        assert _is_pinned_anthropic_model_id("claude-haiku-4-5-20251001") is True
        assert _is_pinned_anthropic_model_id("claude-opus-4-6") is False
        assert _is_pinned_anthropic_model_id("claude-3-5-sonnet-latest") is False
        assert _is_pinned_anthropic_model_id("") is False

    def test_should_block_custom_model_in_production(self, monkeypatch, test_user):
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
        test_user.is_superuser = False

        assert rg._should_block_release_gate_custom_model("anthropic", "claude-opus-4-6", test_user) is True
        assert rg._should_block_release_gate_custom_model("anthropic", "claude-sonnet-4-20250514", test_user) is False

    def test_escape_hatch_superuser_allows_custom(self, monkeypatch, test_user):
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
        test_user.is_superuser = True

        assert rg._should_block_release_gate_custom_model("anthropic", "claude-opus-4-6", test_user) is False

    def test_escape_hatch_flag_allows_custom(self, monkeypatch, test_user):
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", True, raising=False)
        test_user.is_superuser = False

        assert rg._should_block_release_gate_custom_model("anthropic", "claude-opus-4-6", test_user) is False

    def test_non_production_does_not_block(self, monkeypatch, test_user):
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "development", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
        test_user.is_superuser = False

        assert rg._should_block_release_gate_custom_model("anthropic", "claude-opus-4-6", test_user) is False


@pytest.mark.unit
class TestReleaseGateProviderModelMismatch:
    def test_assert_provider_matches_model_allows_matching(self):
        from app.api.v1.endpoints import release_gate as rg

        rg._assert_provider_matches_model("google", "gemini-2.0-flash")
        rg._assert_provider_matches_model("anthropic", "claude-sonnet-4-20250514")
        rg._assert_provider_matches_model("openai", "gpt-4.1-mini")

    def test_assert_provider_matches_model_raises_on_mismatch(self):
        from app.api.v1.endpoints import release_gate as rg
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as e:
            rg._assert_provider_matches_model("openai", "gemini-2.0-flash")
        assert e.value.status_code == 422
        assert isinstance(e.value.detail, dict)
        assert e.value.detail.get("error_code") == "provider_model_mismatch"

    def test_assert_provider_matches_model_skips_when_uninferable_or_missing(self):
        from app.api.v1.endpoints import release_gate as rg

        # Missing model -> no inference -> skip
        rg._assert_provider_matches_model("google", "")
        # Missing provider -> skip
        rg._assert_provider_matches_model("", "gemini-2.0-flash")


@pytest.mark.unit
class TestReleaseGateOverrideSanitizer:
    def test_sanitize_replay_overrides_removes_disallowed_content_keys(self):
        from app.api.v1.endpoints import release_gate as rg

        raw = {
            "messages": [{"role": "user", "content": "hack"}],
            "response": "override response",
            "trace_id": "bad-trace",
            "agent_id": "agent-b",
            "temperature": 0.2,
            "tools": [{"type": "function", "function": {"name": "search"}}],
            "top_p": 0.8,
        }
        cleaned = rg._sanitize_replay_overrides(raw)
        assert isinstance(cleaned, dict)
        assert "messages" not in cleaned
        assert "response" not in cleaned
        assert "trace_id" not in cleaned
        assert "agent_id" not in cleaned
        assert cleaned.get("temperature") == 0.2
        assert cleaned.get("top_p") == 0.8
        assert "tools" in cleaned

    def test_sanitize_replay_overrides_returns_none_when_only_disallowed(self):
        from app.api.v1.endpoints import release_gate as rg

        raw = {
            "messages": [{"role": "user", "content": "x"}],
            "response": "x",
            "trace_id": "x",
            "agent_name": "x",
        }
        assert rg._sanitize_replay_overrides(raw) is None

    def test_normalize_and_infer_provider_helpers(self):
        from app.api.v1.endpoints import release_gate as rg

        assert rg._normalize_provider(" OpenAI ") == "openai"
        assert rg._normalize_provider("anthropic") == "anthropic"
        assert rg._normalize_provider("google") == "google"
        assert rg._normalize_provider("something-else") is None

        assert rg._infer_provider_from_model("claude-sonnet-4-20250514") == "anthropic"
        assert rg._infer_provider_from_model("gemini-2.0-flash") == "google"
        assert rg._infer_provider_from_model("gpt-4.1-mini") == "openai"


@pytest.mark.unit
class TestReleaseGatePlatformCreditGate:
    def _make_user(self, user_id: int = 1, is_superuser: bool = False):
        class DummyUser:
            def __init__(self):
                self.id = user_id
                self.is_superuser = is_superuser

        return DummyUser()

    def test_enforce_platform_credit_limit_allows_when_not_platform_mode(self, monkeypatch):
        from app.api.v1.endpoints import release_gate as rg

        payload = rg.ReleaseGateValidateRequest(model_source="detected")
        user = self._make_user()

        # Should not even consult guard credit checker when not in platform mode.
        called = {"v": False}

        def _fake_check(*args, **kwargs):
            called["v"] = True
            return (False, "blocked")

        monkeypatch.setattr(rg, "check_guard_credits_limit", _fake_check, raising=True)
        rg._enforce_platform_replay_credit_limit(payload, db=None, current_user=user)
        assert called["v"] is False

    def test_enforce_platform_credit_limit_allows_when_quota_available(self, monkeypatch):
        from app.api.v1.endpoints import release_gate as rg

        payload = rg.ReleaseGateValidateRequest(model_source="platform", replay_provider="openai")
        user = self._make_user()

        monkeypatch.setattr(
            rg,
            "check_guard_credits_limit",
            lambda db, uid, is_super: (True, None),
            raising=True,
        )
        # No exception when allowed
        rg._enforce_platform_replay_credit_limit(payload, db=None, current_user=user)

    def test_enforce_platform_credit_limit_blocks_with_expected_error_code(self, monkeypatch):
        from app.api.v1.endpoints import release_gate as rg
        from fastapi import HTTPException

        payload = rg.ReleaseGateValidateRequest(model_source="platform", replay_provider="openai")
        user = self._make_user()

        monkeypatch.setattr(
            rg,
            "check_guard_credits_limit",
            lambda db, uid, is_super: (False, "Hosted replay credit limit reached."),
            raising=True,
        )

        with pytest.raises(HTTPException) as e:
            rg._enforce_platform_replay_credit_limit(payload, db=None, current_user=user)

        assert e.value.status_code == 403
        assert isinstance(e.value.detail, dict)
        assert e.value.detail.get("code") == "LIMIT_PLATFORM_REPLAY_CREDITS"

