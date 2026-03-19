from __future__ import annotations

from typing import Any, Dict


def resolve_capabilities(provider: str, model_id: str) -> Dict[str, Any]:
    """
    Minimal capability matrix for request shaping.

    This is intentionally conservative: we only encode what we need to safely
    construct provider payloads, while keeping model-specific overrides small.
    """
    p = str(provider or "").strip().lower()
    _m = str(model_id or "").strip()

    # Defaults by provider
    if p == "openai":
        return {
            "supports_system_prompt": True,
            "supports_tools": True,
            "supports_tool_choice": True,
            "openai_system_mode": "messages_role_system",
        }

    if p == "anthropic":
        return {
            "supports_system_prompt": True,
            "supports_tools": True,
            "supports_tool_choice": True,
            "anthropic_system_mode": "top_level_system",
            "anthropic_tool_schema_mode": "input_schema",
        }

    if p == "google":
        # Default to snake_case; our fallback chain handles camelCase drift.
        return {
            "supports_system_prompt": True,
            "supports_tools": True,
            "supports_tool_choice": True,
            "google_system_instruction_field": "system_instruction",
        }

    # Unknown provider: be safest and disable extras.
    return {
        "supports_system_prompt": True,
        "supports_tools": False,
        "supports_tool_choice": False,
    }

