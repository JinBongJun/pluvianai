from app.core.credits import get_model_factor, calculate_credits


def test_get_model_factor_exact_match():
    assert get_model_factor("openai", "gpt-4.1-mini") == 1
    assert get_model_factor("openai", "gpt-4o") == 6


def test_get_model_factor_prefix_match():
    # Versioned model IDs should still match base names
    assert get_model_factor("openai", "gpt-4.1-mini-2025-05-01") == 1


def test_get_model_factor_unknown_defaults_to_one():
    assert get_model_factor("unknown", "some-model") == 1
    assert get_model_factor("openai", "made-up-model-name") == 1


def test_calculate_credits_basic():
    # 1500 tokens at factor 1 -> ceil(1.5) = 2k => 2 credits
    credits = calculate_credits("openai", "gpt-4.1-mini", 1000, 500)
    assert credits == 2


def test_calculate_credits_uses_factor():
    # 1000 tokens at factor 6 -> 1k * 6 = 6 credits
    credits = calculate_credits("openai", "gpt-4o", 600, 400)
    assert credits == 6


def test_calculate_credits_minimum_chunk():
    # Even tiny calls should cost at least 1k chunk
    assert calculate_credits("openai", "gpt-4.1-mini", 1, 1) == 1

