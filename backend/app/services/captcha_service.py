"""
Google reCAPTCHA v3 verification helper.
"""

from __future__ import annotations

from typing import Optional
import httpx
from app.core.config import settings
from app.core.logging_config import logger


class CaptchaService:
    VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"

    def __init__(self):
        self.secret = getattr(settings, "RECAPTCHA_SECRET", None)
        self.min_score = getattr(settings, "RECAPTCHA_MIN_SCORE", 0.5)

    async def verify(self, token: Optional[str]) -> bool:
        if not self.secret:
            return True  # Captcha disabled
        if not token:
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    self.VERIFY_URL,
                    data={"secret": self.secret, "response": token},
                )
                data = resp.json()
                success = data.get("success", False)
                score = data.get("score", 0)
                action_ok = data.get("action") in (None, "login")
                return bool(success and score >= self.min_score and action_ok)
        except Exception as exc:  # pragma: no cover - network guarded
            logger.warning(f"Captcha verification failed: {exc}")
            return False


captcha_service = CaptchaService()
