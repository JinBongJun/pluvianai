from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode
import secrets

import httpx
import jwt
from jwt import InvalidTokenError

from app.core.config import settings


GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
OAUTH_STATE_COOKIE_NAME = "oauth_google_state"


@dataclass
class GoogleIdentity:
    email: str
    email_verified: bool
    google_id: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


class GoogleOAuthService:
    def __init__(self):
        self.client_id = settings.GOOGLE_OAUTH_CLIENT_ID
        self.client_secret = settings.GOOGLE_OAUTH_CLIENT_SECRET

    @property
    def enabled(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def callback_url(self) -> str:
        return f"{settings.API_BASE_URL.rstrip('/')}/api/v1/auth/oauth/google/callback"

    def create_state_token(
        self,
        *,
        intent: str,
        next_path: Optional[str],
        terms_accepted: bool,
    ) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "intent": intent,
            "next_path": next_path if next_path and next_path.startswith("/") else "/organizations",
            "terms_accepted": bool(terms_accepted),
            "nonce": secrets.token_urlsafe(16),
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=10)).timestamp()),
            "type": "google_oauth_state",
        }
        return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    def validate_state_token(
        self,
        *,
        state_token: str,
        cookie_state_token: Optional[str],
    ) -> tuple[Optional[dict[str, Any]], Optional[str]]:
        if not state_token or not cookie_state_token:
            return None, "missing_state"
        if state_token != cookie_state_token:
            return None, "state_mismatch"
        try:
            payload = jwt.decode(
                state_token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
            )
        except InvalidTokenError:
            return None, "invalid_state"
        if payload.get("type") != "google_oauth_state":
            return None, "invalid_state"
        return payload, None

    def build_authorization_url(self, *, state_token: str) -> str:
        query = urlencode(
            {
                "client_id": self.client_id,
                "redirect_uri": self.callback_url(),
                "response_type": "code",
                "scope": "openid email profile",
                "access_type": "offline",
                "include_granted_scopes": "true",
                "prompt": "select_account",
                "state": state_token,
            }
        )
        return f"{GOOGLE_AUTHORIZE_URL}?{query}"

    async def get_identity_from_code(self, code: str) -> GoogleIdentity:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_res = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uri": self.callback_url(),
                    "grant_type": "authorization_code",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            token_res.raise_for_status()
            token_data = token_res.json()
            id_token = token_data.get("id_token")
            access_token = token_data.get("access_token")
            if not id_token or not access_token:
                raise ValueError("Google token response missing id_token or access_token")

            tokeninfo_res = await client.get(GOOGLE_TOKENINFO_URL, params={"id_token": id_token})
            tokeninfo_res.raise_for_status()
            claims = tokeninfo_res.json()

            aud = claims.get("aud")
            iss = claims.get("iss")
            sub = claims.get("sub")
            email = str(claims.get("email") or "").strip().lower()
            email_verified = str(claims.get("email_verified") or "").lower() == "true"
            exp = int(claims.get("exp") or 0)
            now_ts = int(datetime.now(timezone.utc).timestamp())

            if aud != self.client_id:
                raise ValueError("Google token audience mismatch")
            if iss not in GOOGLE_ISSUERS:
                raise ValueError("Google token issuer mismatch")
            if not sub or not email:
                raise ValueError("Google identity missing sub or email")
            if exp and exp < now_ts:
                raise ValueError("Google token expired")
            if not email_verified:
                raise ValueError("Google email is not verified")

            userinfo_res = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo_res.raise_for_status()
            userinfo = userinfo_res.json()

        return GoogleIdentity(
            email=email,
            email_verified=email_verified,
            google_id=sub,
            full_name=userinfo.get("name") or claims.get("name"),
            avatar_url=userinfo.get("picture"),
        )
