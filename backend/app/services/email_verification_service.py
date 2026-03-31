import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_config import logger
from app.models.email_verification_token import EmailVerificationToken
from app.models.user import User
from app.services.email_service import EmailService


class EmailVerificationService:
    """Create, send, and consume email verification tokens."""

    def __init__(self, db: Session):
        self.db = db
        self.email_service = EmailService()

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _frontend_verify_url(self, token: str) -> str:
        return f"{settings.APP_BASE_URL.rstrip('/')}/verify-email?token={quote(token)}"

    def issue_token(
        self,
        *,
        user: User,
        email: str,
        purpose: str,
        expires_in_hours: int = 24,
    ) -> EmailVerificationToken:
        now = self._now()
        (
            self.db.query(EmailVerificationToken)
            .filter(
                EmailVerificationToken.user_id == user.id,
                EmailVerificationToken.purpose == purpose,
                EmailVerificationToken.used_at.is_(None),
            )
            .update({"used_at": now}, synchronize_session=False)
        )

        token = EmailVerificationToken(
            user_id=user.id,
            email=email,
            token=secrets.token_urlsafe(32),
            purpose=purpose,
            expires_at=now + timedelta(hours=expires_in_hours),
        )
        self.db.add(token)
        self.db.flush()
        return token

    async def send_signup_verification(self, user: User) -> Tuple[EmailVerificationToken, Dict[str, Any]]:
        token = self.issue_token(user=user, email=user.email, purpose="signup")
        url = self._frontend_verify_url(token.token)
        result = await self.email_service.send_alert_email(
            to=user.email,
            subject="Verify your PluvianAI email",
            html_content=(
                "<p>Welcome to PluvianAI.</p>"
                f"<p>Please verify your email to activate login access.</p><p><a href=\"{url}\">Verify email</a></p>"
            ),
            text_content=f"Verify your email: {url}",
        )
        return token, result

    async def send_email_change_verification(
        self, *, user: User, new_email: str
    ) -> Tuple[EmailVerificationToken, Dict[str, Any]]:
        token = self.issue_token(user=user, email=new_email, purpose="change_email")
        url = self._frontend_verify_url(token.token)
        result = await self.email_service.send_alert_email(
            to=new_email,
            subject="Confirm your new PluvianAI email",
            html_content=(
                "<p>We received a request to change your PluvianAI account email.</p>"
                f"<p>Confirm the new address by opening this link:</p><p><a href=\"{url}\">Confirm email change</a></p>"
            ),
            text_content=f"Confirm your email change: {url}",
        )
        return token, result

    def consume_token(self, token_value: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        token = (
            self.db.query(EmailVerificationToken)
            .filter(EmailVerificationToken.token == token_value)
            .first()
        )
        if not token:
            return None, "invalid_token"
        if token.used_at is not None:
            return None, "token_already_used"
        expires_at = token.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= self._now():
            return None, "token_expired"

        user = self.db.query(User).filter(User.id == token.user_id).first()
        if not user:
            return None, "user_not_found"

        if token.purpose == "signup":
            user.is_email_verified = True
        elif token.purpose == "change_email":
            existing = self.db.query(User).filter(User.email == token.email, User.id != user.id).first()
            if existing:
                return None, "email_taken"
            user.email = token.email
            user.is_email_verified = True
        else:
            return None, "invalid_purpose"

        token.used_at = self._now()
        self.db.flush()
        logger.info(
            "Email verification token consumed",
            extra={"user_id": user.id, "purpose": token.purpose},
        )
        return {
            "verified": True,
            "purpose": token.purpose,
            "email": user.email,
        }, None
