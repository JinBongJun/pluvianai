from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import release_gate as rg
from app.services.release_gate_preflight import resolve_release_gate_provider_context


@pytest.mark.unit
def test_preflight_service_raises_for_provider_model_mismatch(test_user):
    payload = SimpleNamespace(
        model_source="platform",
        replay_provider="openai",
        new_model="gemini-2.5-flash",
        replay_user_api_key_id=None,
    )

    with pytest.raises(HTTPException) as exc:
        resolve_release_gate_provider_context(
            project_id=1,
            payload=payload,
            db=None,  # not used before provider mismatch raises
            current_user=test_user,
            snapshots=[],
            normalize_provider=rg._normalize_provider,
            infer_provider_from_model=rg._infer_provider_from_model,
            assert_provider_matches_model=rg._assert_provider_matches_model,
            hosted_platform_policy_bypass=rg._hosted_platform_policy_bypass,
            hosted_platform_model_allowed=rg._hosted_platform_model_allowed,
            should_block_release_gate_custom_model=rg._should_block_release_gate_custom_model,
            resolve_snapshot_provider=rg._resolve_snapshot_provider,
        )

    assert exc.value.status_code == 422
    assert exc.value.detail["error_code"] == "provider_model_mismatch"


@pytest.mark.unit
def test_preflight_service_raises_for_non_hosted_platform_model(monkeypatch, test_user):
    monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
    monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
    test_user.is_superuser = False

    payload = SimpleNamespace(
        model_source="platform",
        replay_provider="anthropic",
        new_model="claude-opus-4-6",
        replay_user_api_key_id=None,
    )

    with pytest.raises(HTTPException) as exc:
        resolve_release_gate_provider_context(
            project_id=1,
            payload=payload,
            db=None,  # not used before hosted-model check raises
            current_user=test_user,
            snapshots=[],
            normalize_provider=rg._normalize_provider,
            infer_provider_from_model=rg._infer_provider_from_model,
            assert_provider_matches_model=rg._assert_provider_matches_model,
            hosted_platform_policy_bypass=rg._hosted_platform_policy_bypass,
            hosted_platform_model_allowed=rg._hosted_platform_model_allowed,
            should_block_release_gate_custom_model=rg._should_block_release_gate_custom_model,
            resolve_snapshot_provider=rg._resolve_snapshot_provider,
        )

    assert exc.value.status_code == 422
    assert exc.value.detail["error_code"] in {
        "HOSTED_MODEL_NOT_ALLOWED",
        "release_gate_requires_pinned_model",
    }
