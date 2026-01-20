"""
Password policy validation.
"""
from __future__ import annotations

import re
import hashlib
from dataclasses import dataclass
from typing import List
import httpx
from app.core.config import settings
from app.core.logging_config import logger


COMMON_WEAK_PASSWORDS = {
    "password",
    "123456",
    "12345678",
    "qwerty",
    "abc123",
    "iloveyou",
    "admin",
}


@dataclass
class PasswordValidationResult:
    valid: bool
    reasons: List[str]


class PasswordPolicyService:
    def __init__(self):
        self.min_length = getattr(settings, "PASSWORD_POLICY_MIN_LENGTH", 12)
        self.enable_hibp = getattr(settings, "ENABLE_HIBP_CHECK", False)

    def _check_hibp(self, password: str) -> bool:
        """
        Return True if password is safe (not found in HIBP).
        Uses k-anonymity; network failures are treated as safe to avoid false blocks.
        """
        try:
            sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
            prefix, suffix = sha1[:5], sha1[5:]
            url = f"https://api.pwnedpasswords.com/range/{prefix}"
            headers = {"Add-Padding": "true"}
            resp = httpx.get(url, headers=headers, timeout=5.0)
            if resp.status_code != 200:
                return True
            for line in resp.text.splitlines():
                parts = line.split(":")
                if len(parts) != 2:
                    continue
                if parts[0].strip().upper() == suffix:
                    return False
            return True
        except Exception as exc:  # pragma: no cover - network guarded
            logger.warning(f"HIBP check failed, skipping: {exc}")
            return True

    def validate(self, password: str) -> PasswordValidationResult:
        reasons: List[str] = []

        if len(password) < self.min_length:
            reasons.append(f"Password must be at least {self.min_length} characters.")

        if password.lower() in COMMON_WEAK_PASSWORDS:
            reasons.append("Password is too common.")

        if not re.search(r"[A-Z]", password):
            reasons.append("Password must include an uppercase letter.")
        if not re.search(r"[a-z]", password):
            reasons.append("Password must include a lowercase letter.")
        if not re.search(r"\d", password):
            reasons.append("Password must include a number.")
        if not re.search(r"[^\w\s]", password):
            reasons.append("Password must include a special character.")

        if self.enable_hibp:
            safe = self._check_hibp(password)
            if not safe:
                reasons.append("Password has appeared in a data breach.")

        return PasswordValidationResult(valid=len(reasons) == 0, reasons=reasons)


password_policy_service = PasswordPolicyService()
