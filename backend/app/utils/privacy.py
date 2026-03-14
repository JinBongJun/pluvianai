"""
Privacy-oriented helpers for logs and analytics.
"""

from __future__ import annotations

import re


EMAIL_PATTERN = re.compile(r"(?P<local>[^@\s]+)@(?P<domain>[^@\s]+\.[^@\s]+)")


def mask_email(email: str | None) -> str:
    if not email:
        return "[redacted]"

    match = EMAIL_PATTERN.fullmatch(email.strip())
    if not match:
        return "[redacted]"

    local = match.group("local")
    domain = match.group("domain")

    local_mask = local[0] + "***" if local else "***"
    return f"{local_mask}@{domain}"
