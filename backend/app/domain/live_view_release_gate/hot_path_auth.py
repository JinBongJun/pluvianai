from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.core.security import (
    TokenValidationError,
    auth_error_detail,
    decode_token_or_raise,
)
from app.services.cache_service import cache_service


def hot_auth_cache_key(feature_name: str, user_id: int) -> str:
    return f"user:{int(user_id)}:{feature_name}_hot_auth"


def resolve_hot_path_user_id(
    request: Request,
    token: Optional[str],
    db: Session,
    *,
    feature_name: str,
    auth_cache_ttl_sec: int,
) -> int:
    final_token = token or request.cookies.get("access_token")
    if not final_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail("no_token", "You need to sign in to access this page."),
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token_or_raise(final_token, expected_type="access")
    except TokenValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(exc.code, exc.message),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "access_token_invalid",
                "Your login session is no longer valid. Please sign in again.",
            ),
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id_int = int(user_id)

    if hasattr(request, "state"):
        request.state.auth_method = "jwt"
        request.state.api_key_scope = None

    if cache_service.enabled:
        cached = cache_service.get(hot_auth_cache_key(feature_name, user_id_int))
        if isinstance(cached, dict) and cached.get("active") is True:
            return user_id_int

    user_row = db.query(User.id, User.is_active).filter(User.id == user_id_int).first()
    if not user_row or not bool(user_row.is_active):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if cache_service.enabled:
        cache_service.set(
            hot_auth_cache_key(feature_name, user_id_int),
            {"active": True},
            ttl=auth_cache_ttl_sec,
        )
    return user_id_int
