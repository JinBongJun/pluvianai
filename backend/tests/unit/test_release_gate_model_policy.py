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

