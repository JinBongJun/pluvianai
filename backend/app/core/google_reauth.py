from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Response
from jose import JWTError, jwt

from app.core.config import settings


GOOGLE_DELETE_REAUTH_COOKIE_NAME = "google_delete_reauth"
GOOGLE_DELETE_REAUTH_TOKEN_TYPE = "google_delete_reauth"
GOOGLE_DELETE_REAUTH_TTL_MINUTES = 10


def create_google_delete_reauth_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=GOOGLE_DELETE_REAUTH_TTL_MINUTES)).timestamp()),
        "type": GOOGLE_DELETE_REAUTH_TOKEN_TYPE,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def has_valid_google_delete_reauth_token(token: Optional[str], user_id: int) -> bool:
    if not token:
        return False

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return False

    return payload.get("type") == GOOGLE_DELETE_REAUTH_TOKEN_TYPE and payload.get("sub") == str(user_id)


def set_google_delete_reauth_cookie(response: Response, user_id: int) -> None:
    secure = settings.ENVIRONMENT == "production"
    cookie_domain = settings.AUTH_COOKIE_DOMAIN or None
    token = create_google_delete_reauth_token(user_id)
    response.set_cookie(
        key=GOOGLE_DELETE_REAUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        domain=cookie_domain,
        max_age=GOOGLE_DELETE_REAUTH_TTL_MINUTES * 60,
    )


def clear_google_delete_reauth_cookie(response: Response) -> None:
    cookie_domain = settings.AUTH_COOKIE_DOMAIN or None
    response.delete_cookie(GOOGLE_DELETE_REAUTH_COOKIE_NAME, path="/", domain=cookie_domain)
