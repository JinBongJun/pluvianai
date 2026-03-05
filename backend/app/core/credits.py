from __future__ import annotations

"""
GuardCredit calculation utilities.

All provider/model usage is normalized into a single unit: GuardCredit.
This keeps billing logic simple and decoupled from provider-specific pricing.
"""

from math import ceil
from typing import Dict


# Provider/model -> factor mapping.
# NOTE:
# - Keys are lowercased.
# - Where models share similar pricing, we group them with the same factor.
# - Unknown models default to factor=1 so they are treated as "standard".
MODEL_FACTORS: Dict[str, Dict[str, int]] = {
    "openai": {
        # Standard / cheap tier (good for MVP platform usage)
        "gpt-4.1-nano": 1,
        "gpt-4.1-mini": 1,
        "gpt-4o-mini": 1,
        # Reasonable mid-tier models
        "o3-mini": 3,
        "o4-mini": 3,
        # Full GPT-4.x models
        "gpt-4.1": 6,
        "gpt-4o": 6,
        # High-cost reasoning models
        "o1": 10,
        "o1-preview": 10,
        "o1-mini": 8,
        "o3": 10,
        "o3-pro": 10,
    },
    "anthropic": {
        # Haiku: budget tier
        "claude-3-haiku": 1,
        "claude-3.5-haiku": 1,
        "claude-4-haiku": 1,
        # Sonnet: mid/high tier
        "claude-3-sonnet": 6,
        "claude-3.5-sonnet": 6,
        "claude-4-sonnet": 6,
        # Opus / advanced reasoning
        "claude-3-opus": 10,
        "claude-4-opus": 10,
    },
    "google": {
        # Gemini Flash: budget tier
        "gemini-1.5-flash": 1,
        "gemini-2.0-flash": 1,
        "gemini-2.0-flash-lite": 1,
        # Gemini Pro: more expensive
        "gemini-1.5-pro": 5,
        "gemini-2.0-pro": 5,
        "gemini-2.5-pro": 5,
    },
}


def get_model_factor(provider: str | None, model: str | None) -> int:
    """
    Look up a model factor for the given provider/model.

    Strategy:
    - Normalize provider/model to lowercase.
    - Try exact match first.
    - Then try prefix match (useful when users pass full versioned IDs).
    - Fallback to 1 when unknown.
    """
    provider_key = (provider or "").strip().lower()
    model_key = (model or "").strip().lower()

    if not provider_key or not model_key:
        return 1

    per_provider = MODEL_FACTORS.get(provider_key) or {}
    if not per_provider:
        return 1

    # Exact match
    if model_key in per_provider:
        return per_provider[model_key]

    # Prefix match (e.g. "gpt-4.1-mini-2025-05-01" should still hit "gpt-4.1-mini")
    for name, factor in per_provider.items():
        if model_key.startswith(name):
            return factor

    return 1


def calculate_credits(
    provider: str | None,
    model: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
) -> int:
    """
    Calculate GuardCredits from token usage.

    - Token unit: per 1K tokens (input + output combined).
    - Minimum charge: 1K tokens (to avoid zero-credit tiny calls).
    - Multiplied by model factor derived from provider/model.
    """
    total_tokens = max(0, int(input_tokens or 0) + int(output_tokens or 0))
    # Bill in 1K-token chunks, minimum 1
    total_k = max(1, ceil(total_tokens / 1000)) if total_tokens > 0 else 1
    factor = get_model_factor(provider, model)
    return int(total_k * factor)


__all__ = ["MODEL_FACTORS", "get_model_factor", "calculate_credits"]

