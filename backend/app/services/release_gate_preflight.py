from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.models.snapshot import Snapshot
from app.models.user import User
from app.models.user_api_key import UserApiKey
from app.services.ops_alerting import ops_alerting
from app.services.user_api_key_service import UserApiKeyService


@dataclass(frozen=True)
class ReleaseGateProviderResolution:
    explicit_provider: Optional[str]
    replay_user_api_key_override: Optional[str]


def resolve_release_gate_provider_context(
    *,
    project_id: int,
    payload: Any,
    db: Session,
    current_user: User,
    snapshots: List[Snapshot],
    normalize_provider: Callable[[Any], Optional[str]],
    infer_provider_from_model: Callable[[Any], Optional[str]],
    assert_provider_matches_model: Callable[[Any, Any], None],
    hosted_platform_policy_bypass: Callable[[Optional[User]], bool],
    hosted_platform_model_allowed: Callable[[Optional[str], Any], bool],
    should_block_release_gate_custom_model: Callable[[Optional[str], Any, Optional[User]], bool],
    resolve_snapshot_provider: Callable[[Snapshot], Optional[str]],
) -> ReleaseGateProviderResolution:
    use_platform_model = payload.model_source == "platform"

    explicit_provider = normalize_provider(payload.replay_provider)
    if use_platform_model and str(payload.new_model or "").strip() and payload.replay_provider:
        assert_provider_matches_model(payload.replay_provider, payload.new_model)
    if use_platform_model and not explicit_provider:
        inferred_provider = infer_provider_from_model(payload.new_model)
        if inferred_provider:
            explicit_provider = inferred_provider
    if payload.replay_provider and not explicit_provider:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unsupported replay_provider. Use one of: openai, anthropic, google.",
        )
    if use_platform_model and not explicit_provider:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Platform model mode requires replay_provider or provider-inferrable new_model.",
        )

    if (
        use_platform_model
        and explicit_provider
        and str(payload.new_model or "").strip()
        and not hosted_platform_policy_bypass(current_user)
        and not hosted_platform_model_allowed(explicit_provider, payload.new_model)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "HOSTED_MODEL_NOT_ALLOWED",
                "message": (
                    "This model is not available for hosted (platform) runs. "
                    "Pick a hosted quick-pick model or use Custom model ID with your saved API key (BYOK)."
                ),
                "provider": explicit_provider,
                "model_id": str(payload.new_model or "").strip(),
            },
        )

    if (
        use_platform_model
        and explicit_provider == "anthropic"
        and str(payload.new_model or "").strip()
        and should_block_release_gate_custom_model(explicit_provider, payload.new_model, current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "release_gate_requires_pinned_model",
                "message": (
                    "Release Gate requires a pinned Anthropic model id (ends with YYYYMMDD) for reproducibility."
                ),
                "provider": "anthropic",
                "model_id": str(payload.new_model or "").strip(),
            },
        )

    unresolved_snapshot_ids: List[int] = []
    if not explicit_provider:
        for snapshot in snapshots:
            resolved_provider = resolve_snapshot_provider(snapshot)
            if not resolved_provider:
                unresolved_snapshot_ids.append(snapshot.id)

    if unresolved_snapshot_ids:
        unresolved_provider = explicit_provider or resolve_snapshot_provider(snapshots[0]) or "unknown"
        ops_alerting.observe_provider_error(
            project_id=project_id,
            provider=unresolved_provider,
            error_code="provider_resolution_failed",
            error_summary=f"unresolved_snapshot_ids={len(unresolved_snapshot_ids)}",
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "provider_resolution_failed",
                "message": "Could not resolve provider for one or more selected snapshots.",
                "snapshot_ids": unresolved_snapshot_ids[:20],
            },
        )

    replay_user_api_key_override: Optional[str] = None
    if not use_platform_model:
        key_service = UserApiKeyService(db)
        rid = getattr(payload, "replay_user_api_key_id", None)
        if rid is not None:
            row = (
                db.query(UserApiKey)
                .filter(
                    UserApiKey.id == int(rid),
                    UserApiKey.project_id == project_id,
                    UserApiKey.is_active.is_(True),
                )
                .first()
            )
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error_code": "invalid_replay_user_api_key_id",
                        "message": "Saved API key not found for this project.",
                    },
                )
            row_provider = str(row.provider or "").strip().lower()
            if explicit_provider and row_provider != explicit_provider:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={
                        "error_code": "replay_user_api_key_provider_mismatch",
                        "message": "Selected saved API key does not match replay_provider.",
                        "expected_provider": explicit_provider,
                        "key_provider": row_provider,
                    },
                )
            try:
                replay_user_api_key_override = key_service.decrypt_key(row.encrypted_key)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error_code": "invalid_replay_user_api_key_id",
                        "message": "Could not use saved API key.",
                    },
                ) from None

        key_presence_cache: Dict[Tuple[str, Optional[str]], bool] = {}

        def env_key_available(provider: str) -> bool:
            if not (app_settings.SELF_HOSTED_MODE or str(app_settings.ENVIRONMENT).lower() != "production"):
                return False
            value = getattr(app_settings, f"{provider.upper()}_API_KEY", None)
            return isinstance(value, str) and bool(value.strip())

        def has_effective_provider_key(provider: str, agent_id: Optional[str]) -> bool:
            normalized_agent_id = str(agent_id or "").strip() or None
            cache_key = (provider, normalized_agent_id)
            if cache_key in key_presence_cache:
                return key_presence_cache[cache_key]
            exists = env_key_available(provider) or bool(
                key_service.get_user_api_key(project_id, provider, normalized_agent_id)
            )
            key_presence_cache[cache_key] = exists
            return exists

        missing_provider_keys_set: Set[str] = set()
        if explicit_provider:
            if not replay_user_api_key_override:
                for snapshot in snapshots:
                    if not has_effective_provider_key(explicit_provider, getattr(snapshot, "agent_id", None)):
                        missing_provider_keys_set.add(explicit_provider)
        else:
            for snapshot in snapshots:
                resolved_provider = resolve_snapshot_provider(snapshot)
                if not resolved_provider:
                    continue
                if not has_effective_provider_key(
                    resolved_provider,
                    getattr(snapshot, "agent_id", None),
                ):
                    missing_provider_keys_set.add(resolved_provider)

        missing_provider_keys = sorted(missing_provider_keys_set)
        if missing_provider_keys:
            for provider in missing_provider_keys:
                ops_alerting.observe_provider_error(
                    project_id=project_id,
                    provider=provider,
                    error_code="missing_provider_keys",
                    error_summary="Missing API keys for required providers.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error_code": "missing_provider_keys",
                    "missing_provider_keys": missing_provider_keys,
                    "message": "Missing API keys for required providers.",
                },
            )

    return ReleaseGateProviderResolution(
        explicit_provider=explicit_provider,
        replay_user_api_key_override=replay_user_api_key_override,
    )
