"""
Secret redaction helpers for request/response payload persistence.

This complements PII sanitization by masking well-known secret-like keys and values.
"""

from __future__ import annotations

import re
from typing import Any


REDACTED_VALUE = "***redacted***"

# Field names likely to contain credentials/secrets.
_SECRET_KEY_NAME_RE = re.compile(
    r"(?i)(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|authorization|bearer|client[_-]?secret|private[_-]?key)"
)

# Value-level patterns as a best-effort fallback.
_SECRET_VALUE_PATTERNS = [
    re.compile(r"(?i)\bsk-[a-z0-9_-]{20,}\b"),  # OpenAI-like
    re.compile(r"(?i)\bsk-ant-[a-z0-9_-]{20,}\b"),  # Anthropic-like
    re.compile(r"\bAIza[a-zA-Z0-9_-]{20,}\b"),  # Google API key-like
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9\-\._~\+\/]+=*\b"),  # Bearer token header-like
    re.compile(r"(?i)\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b"),  # JWT-like
    # Tool / log previews (release-gate-tool-io-grounding-plan §14.2)
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
]


def _redact_string(value: str) -> str:
    redacted = value
    for pattern in _SECRET_VALUE_PATTERNS:
        redacted = pattern.sub(REDACTED_VALUE, redacted)
    return redacted


def redact_secrets(data: Any) -> Any:
    """
    Recursively redact secret-like fields and token-like string values.
    """
    if isinstance(data, dict):
        out: dict[str, Any] = {}
        for key, value in data.items():
            if _SECRET_KEY_NAME_RE.search(str(key)):
                out[key] = REDACTED_VALUE
            else:
                out[key] = redact_secrets(value)
        return out

    if isinstance(data, list):
        return [redact_secrets(item) for item in data]

    if isinstance(data, str):
        return _redact_string(data)

    return data

