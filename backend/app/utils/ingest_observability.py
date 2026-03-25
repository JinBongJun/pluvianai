"""Non-PII ingest shape signals for ops (see docs/ops-ingest-observability.md)."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict


def request_data_shape_summary(request_data: Any) -> Dict[str, Any]:
    """
    Fingerprint *key presence* only (not values). Used for empty/malformed request ratios in logs.
    """
    if not isinstance(request_data, dict):
        return {
            "key_fp": "none",
            "key_count": 0,
            "has_messages": False,
            "empty_body": True,
        }
    keys = sorted(request_data.keys())
    raw = json.dumps(keys, separators=(",", ":")).encode("utf-8")
    key_fp = hashlib.sha256(raw).hexdigest()[:16]
    msgs = request_data.get("messages")
    has_messages = msgs is not None
    return {
        "key_fp": key_fp,
        "key_count": len(keys),
        "has_messages": bool(has_messages),
        "empty_body": len(keys) == 0,
    }
