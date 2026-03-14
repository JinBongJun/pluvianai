from app.utils.secret_redaction import REDACTED_VALUE, redact_secrets


def test_redact_secrets_masks_secret_keys_and_values():
    # Use placeholders that trigger redaction but do not look like real secrets (avoids scanner false positives).
    payload = {
        "api_key": "test-api-key-placeholder",
        "nested": {
            "Authorization": "Bearer fake-for-unit-test",
            "safe": "hello world",
        },
        "messages": [
            {"role": "user", "content": "token=Bearer fake"},  # value pattern triggers in-content redaction
            {"role": "assistant", "content": "normal text"},
        ],
    }

    out = redact_secrets(payload)

    assert out["api_key"] == REDACTED_VALUE
    assert out["nested"]["Authorization"] == REDACTED_VALUE
    assert out["nested"]["safe"] == "hello world"
    assert REDACTED_VALUE in out["messages"][0]["content"]
    assert out["messages"][1]["content"] == "normal text"

