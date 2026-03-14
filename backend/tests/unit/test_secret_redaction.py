from app.utils.secret_redaction import REDACTED_VALUE, redact_secrets


def test_redact_secrets_masks_secret_keys_and_values():
    payload = {
        "api_key": "sk-test-abcdefghijklmnopqrstuvwxyz123456",
        "nested": {
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb",
            "safe": "hello world",
        },
        "messages": [
            {"role": "user", "content": "token=sk-ant-api03-abcdefghijklmnopqrstuvwxyz"},
            {"role": "assistant", "content": "normal text"},
        ],
    }

    out = redact_secrets(payload)

    assert out["api_key"] == REDACTED_VALUE
    assert out["nested"]["Authorization"] == REDACTED_VALUE
    assert out["nested"]["safe"] == "hello world"
    assert REDACTED_VALUE in out["messages"][0]["content"]
    assert out["messages"][1]["content"] == "normal text"

