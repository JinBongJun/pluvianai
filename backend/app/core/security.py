"""
Security utilities for JWT authentication
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any, Tuple
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

# Password hashing context
# Use bcrypt with explicit backend to avoid initialization issues
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# OAuth2 scheme; auto_error=False so get_current_user can fall back to cookies
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)
API_KEY_LAST_USED_WRITE_INTERVAL = timedelta(minutes=5)


class TokenValidationError(Exception):
    """Structured JWT validation error for user-facing auth responses."""

    def __init__(self, code: str, message: str, log_reason: Optional[str] = None):
        self.code = code
        self.message = message
        self.log_reason = log_reason or message
        super().__init__(self.message)


def auth_error_detail(code: str, message: str, **extra: Any) -> dict:
    detail = {"code": code, "message": message}
    detail.update({k: v for k, v in extra.items() if v is not None})
    return detail


def _should_update_api_key_last_used(last_used_at: Optional[datetime], now_utc: datetime) -> bool:
    if last_used_at is None:
        return True
    if last_used_at.tzinfo is None:
        last_used_at = last_used_at.replace(tzinfo=timezone.utc)
    return now_utc - last_used_at >= API_KEY_LAST_USED_WRITE_INTERVAL


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": now, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    
    from app.core.logging_config import logger
    logger.info(f"🔑 [create_access_token] Token created. Exp: {expire.isoformat()}, Minutes: {settings.ACCESS_TOKEN_EXPIRE_MINUTES}")
    
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    from app.core.logging_config import logger
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"leeway": 300}  # Increase leeway to 5 minutes
        )
        return payload
    except JWTError as e:
        error_msg = str(e)
        logger.error(f"🔴 [decode_token] JWT Error: {error_msg}")
        # Log specific reasons for failure
        if "expired" in error_msg.lower():
            logger.error(f"⏰ [decode_token] Token expired. Check server time vs client time.")
        elif "signature" in error_msg.lower():
            logger.error(f"🔑 [decode_token] Signature mismatch. Possible SECRET_KEY issue.")
        return None


def decode_token_or_raise(token: str, *, expected_type: Optional[str] = None) -> dict:
    """Decode a JWT and raise a structured exception on expected auth failures."""
    from app.core.logging_config import logger

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"leeway": 300},
        )
    except ExpiredSignatureError as exc:
        code = f"{expected_type}_token_expired" if expected_type else "auth_token_expired"
        raise TokenValidationError(
            code=code,
            message="Your session has expired. Please sign in again.",
            log_reason=str(exc),
        ) from exc
    except JWTError as exc:
        code = f"{expected_type}_token_invalid" if expected_type else "auth_token_invalid"
        raise TokenValidationError(
            code=code,
            message="Your login session is no longer valid. Please sign in again.",
            log_reason=str(exc),
        ) from exc

    if expected_type and payload.get("type") != expected_type:
        logger.warning(
            "JWT token type mismatch",
            extra={"expected_type": expected_type, "actual_type": payload.get("type")},
        )
        raise TokenValidationError(
            code=f"{expected_type}_token_invalid",
            message="Your login session is no longer valid. Please sign in again.",
            log_reason=f"Token type mismatch: expected {expected_type}, got {payload.get('type')}",
        )
    return payload


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get the current authenticated user from JWT token.
    Checks Authorization header first (via oauth2_scheme), then falls back to cookies.
    """
    from app.models.user import User
    
    from app.core.logging_config import logger
    
    # 1. Try to get token from Authorization header
    final_token = token
    source = "Authorization Header"
    
    # 2. Fallback to cookie if Header is missing
    if not final_token:
        final_token = request.cookies.get("access_token")
        source = "Cookie"

    if not final_token:
        logger.warning(f"🟡 [get_current_user] 401 Unauthorized: No token provided via Header or Cookie. PATH: {request.url.path}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail("no_token", "You need to sign in to access this page."),
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.debug(f"🔍 [get_current_user] Token source: {source}, Token length: {len(final_token)}")
    try:
        payload = decode_token_or_raise(final_token, expected_type="access")
    except TokenValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(exc.code, exc.message),
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "access_token_invalid",
                "Your login session is no longer valid. Please sign in again.",
            ),
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "access_token_invalid",
                "Your login session is no longer valid. Please sign in again.",
            ),
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if hasattr(request, "state"):
        request.state.auth_method = "jwt"
        request.state.api_key_scope = None  # JWT = full access

    return user


async def get_current_user_optional(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Dependency to get the current user if authenticated, otherwise None
    Useful for public endpoints that have optional authentication
    """
    from app.models.user import User

    if not authorization:
        return None

    # Extract token from "Bearer {token}" format
    if authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
    else:
        return None

    payload = decode_token(token)
    if payload is None:
        return None

    # Extract user ID from token
    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        return None

    # Fetch user from database
    try:
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user is None or not user.is_active:
            return None
        return user
    except (ValueError, TypeError):
        return None


async def get_user_from_api_key(
    authorization: Optional[str] = Header(None), db: Session = Depends(get_db)
) -> Tuple[User, List[str]]:
    """
    Get user and scope list from API Key (for SDK authentication).

    SDK에서 Authorization: Bearer ag_live_xxxxx 형식으로 요청을 보내면
    API Key를 검증하고 해당 User와 scope 목록을 반환합니다.

    Args:
        authorization: Authorization header (Bearer {api_key} 형식)
        db: Database session

    Returns:
        Tuple of (User, scope list e.g. ["*"] or ["ingest","read"])

    Raises:
        HTTPException: If API key is invalid or expired
    """
    import hashlib
    from app.models.user import User
    from app.models.api_key import APIKey

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail("api_key_missing", "API key is required for this request."),
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract API key from "Bearer ag_live_xxxxx" format
    if authorization.startswith("Bearer "):
        api_key = authorization.replace("Bearer ", "").strip()
    elif authorization.startswith("Api-Key "):
        api_key = authorization.replace("Api-Key ", "").strip()
    else:
        api_key = authorization.strip()

    # Validate API key format
    if not api_key.startswith("ag_live_") and not api_key.startswith("ag_test_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail("api_key_invalid_format", "API key format is invalid."),
        )

    # Hash the API key for lookup
    hashed_key = hashlib.sha256(api_key.encode()).hexdigest()

    # Look up API key in database
    api_key_record = db.query(APIKey).filter(APIKey.key_hash == hashed_key, APIKey.is_active.is_(True)).first()

    if not api_key_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail("api_key_invalid", "API key is invalid."),
        )

    # Check if API key is expired (timezone-aware UTC comparison)
    now_utc = datetime.now(timezone.utc)
    if api_key_record.expires_at and api_key_record.expires_at < now_utc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail("api_key_expired", "API key has expired."),
        )

    # Get user
    user = db.query(User).filter(User.id == api_key_record.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail("api_key_user_invalid", "API key is no longer associated with an active user."),
        )

    # Avoid a write on every SDK request; refresh usage timestamp periodically.
    if _should_update_api_key_last_used(api_key_record.last_used_at, now_utc):
        api_key_record.last_used_at = now_utc
        db.flush()

    # Parse scope: "*", "ingest,read", or JSON ["ingest","read"]. Default ["*"] for backward compatibility.
    scope_raw = (api_key_record.scope or "").strip() or "*"
    if scope_raw == "*":
        scope_list = ["*"]
    else:
        try:
            import json
            parsed = json.loads(scope_raw)
            scope_list = list(parsed) if isinstance(parsed, list) else [str(parsed)]
        except Exception:
            scope_list = [s.strip() for s in scope_raw.split(",") if s.strip()]
        if not scope_list:
            scope_list = ["*"]

    return user, scope_list


async def get_current_user_or_api_key(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolve authenticated user from either JWT session token or SDK API key.

    Priority:
    1) If Authorization clearly contains an SDK key (ag_live_/ag_test_), validate as API key.
    2) Otherwise, try regular JWT auth (header/cookie).
    3) If JWT fails but Authorization exists, retry as API key.
    """
    normalized_auth = (authorization or "").strip()

    def _extract_bearer_value(raw: str) -> str:
        if raw.startswith("Bearer "):
            return raw.replace("Bearer ", "", 1).strip()
        if raw.startswith("Api-Key "):
            return raw.replace("Api-Key ", "", 1).strip()
        return raw

    auth_value = _extract_bearer_value(normalized_auth) if normalized_auth else ""
    is_sdk_api_key = auth_value.startswith("ag_live_") or auth_value.startswith("ag_test_")

    if is_sdk_api_key:
        user, scope_list = await get_user_from_api_key(authorization=normalized_auth, db=db)
        if hasattr(request, "state"):
            request.state.auth_method = "api_key"
            request.state.api_key_scope = scope_list
        return user

    try:
        user = await get_current_user(request=request, token=token, db=db)
        return user
    except HTTPException as jwt_error:
        if normalized_auth:
            try:
                user, scope_list = await get_user_from_api_key(authorization=normalized_auth, db=db)
                if hasattr(request, "state"):
                    request.state.auth_method = "api_key"
                    request.state.api_key_scope = scope_list
                return user
            except HTTPException:
                pass
        raise jwt_error


class RequireScope:
    """
    Dependency that checks API key scope. Use after get_current_user_or_api_key.
    JWT auth is always allowed. API key auth requires the key to have the required scope or "*".
    """

    def __init__(self, required: str):
        self.required = required

    async def __call__(self, request: Request) -> None:
        auth_method = getattr(request.state, "auth_method", None)
        if auth_method != "api_key":
            return None
        scopes = getattr(request.state, "api_key_scope", None) or []
        if not scopes or "*" in scopes or self.required in scopes:
            return None
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient API key scope. This endpoint requires scope: {self.required}",
        )


def rotate_refresh_token(
    old_refresh_token: str,
    user_id: int,
    db: Session
) -> tuple[str, str]:
    """
    Rotate refresh token: invalidate old and issue new access + refresh tokens.
    
    Args:
        old_refresh_token: The refresh token to rotate
        user_id: User ID
        db: Database session
    
    Returns:
        Tuple of (new_access_token, new_refresh_token)
    """
    import hashlib
    from app.models.user import User
    from app.models.refresh_token import RefreshToken
    
    # Verify old refresh token
    try:
        payload = decode_token_or_raise(old_refresh_token, expected_type="refresh")
    except TokenValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(exc.code, exc.message),
        )
    
    # Verify user
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "refresh_token_invalid",
                "Your login session is no longer valid. Please sign in again.",
            ),
        )
    
    # Calculate hash of old refresh token
    old_token_hash = hashlib.sha256(old_refresh_token.encode()).hexdigest()
    
    # Find the refresh token in database
    refresh_token_record = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == old_token_hash,
            RefreshToken.user_id == user_id
        )
        .first()
    )
    
    # Check if token exists and is valid
    if not refresh_token_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "refresh_token_not_found",
                "Your login session is no longer valid. Please sign in again.",
            ),
        )
    
    # Check if token is already revoked
    if refresh_token_record.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "refresh_token_revoked",
                "This login session has already been replaced. Please sign in again.",
            ),
        )
    
    # Check if token is expired (timezone-aware UTC comparison)
    now_utc = datetime.now(timezone.utc)
    if refresh_token_record.expires_at < now_utc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "refresh_token_expired",
                "Your session has expired. Please sign in again.",
            ),
        )
    
    # Revoke old refresh token
    refresh_token_record.is_revoked = True
    refresh_token_record.revoked_at = now_utc
    
    # Create new tokens
    new_access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id), "email": user.email})
    
    # Calculate hash of new refresh token
    new_token_hash = hashlib.sha256(new_refresh_token.encode()).hexdigest()
    
    # Get expiration time for new refresh token
    new_payload = decode_token(new_refresh_token)
    exp_ts = new_payload.get("exp", 0) if new_payload else 0
    expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc)
    
    # Save new refresh token to database
    new_refresh_token_record = RefreshToken(
        user_id=user_id,
        token_hash=new_token_hash,
        expires_at=expires_at,
        is_revoked=False
    )
    db.add(new_refresh_token_record)
    db.commit()
    
    return new_access_token, new_refresh_token


def rotate_api_key(
    user_id: int,
    old_key_id: Optional[int] = None,
    revoke_old: bool = True,
    db: Optional[Session] = None
) -> tuple[str, int]:
    """
    Rotate API key: create new key, optionally revoke old.
    
    Args:
        user_id: User ID
        old_key_id: Optional old key ID to revoke
        revoke_old: Whether to revoke the old key (default: True)
        db: Database session
    
    Returns:
        Tuple of (new_api_key, new_key_id)
    
    Raises:
        ValueError: If db is not provided
    """
    import secrets
    import hashlib
    from app.models.api_key import APIKey
    
    if not db:
        raise ValueError("Database session required")
    
    # Generate new API key
    key_prefix = "ag_live_"
    random_part = secrets.token_urlsafe(32)
    new_api_key = f"{key_prefix}{random_part}"
    key_hash = hashlib.sha256(new_api_key.encode()).hexdigest()
    
    # Create new API key record (scope defaults to full access)
    new_key_record = APIKey(
        user_id=user_id,
        key_hash=key_hash,
        name="Rotated key",
        scope="*",
        is_active=True,
    )
    db.add(new_key_record)
    db.flush()
    
    # Revoke old key if requested
    if revoke_old and old_key_id:
        old_key = db.query(APIKey).filter(APIKey.id == old_key_id, APIKey.user_id == user_id).first()
        if old_key:
            old_key.is_active = False
            db.commit()
    
    db.commit()
    
    return new_api_key, new_key_record.id
