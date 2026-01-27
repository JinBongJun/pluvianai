"""
Security utilities for JWT authentication
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db

# Password hashing context
# Use bcrypt with explicit backend to avoid initialization issues
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    Dependency to get the current authenticated user from JWT token
    """
    from app.models.user import User

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    # Extract user ID from token
    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    # Fetch user from database
    try:
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user is None or not user.is_active:
            raise credentials_exception
        return user
    except (ValueError, TypeError):
        raise credentials_exception


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


async def get_user_from_api_key(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """
    Get user from API Key (for SDK authentication)

    SDK에서 Authorization: Bearer ag_live_xxxxx 형식으로 요청을 보내면
    API Key를 검증하고 해당 User를 반환합니다.

    Args:
        authorization: Authorization header (Bearer {api_key} 형식)
        db: Database session

    Returns:
        User object

    Raises:
        HTTPException: If API key is invalid or expired
    """
    import hashlib
    from app.models.user import User
    from app.models.api_key import APIKey

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
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
            detail="Invalid API key format",
        )

    # Hash the API key for lookup
    hashed_key = hashlib.sha256(api_key.encode()).hexdigest()

    # Look up API key in database
    api_key_record = db.query(APIKey).filter(APIKey.key_hash == hashed_key, APIKey.is_active.is_(True)).first()

    if not api_key_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    # Check if API key is expired
    if api_key_record.expires_at and api_key_record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key expired",
        )

    # Get user
    user = db.query(User).filter(User.id == api_key_record.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user",
        )

    # Update last_used_at
    api_key_record.last_used_at = datetime.utcnow()
    db.commit()

    return user


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
    payload = decode_token(old_refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    # Verify user
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
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
            detail="Refresh token not found"
        )
    
    # Check if token is already revoked
    if refresh_token_record.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked"
        )
    
    # Check if token is expired
    if refresh_token_record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired"
        )
    
    # Revoke old refresh token
    refresh_token_record.is_revoked = True
    refresh_token_record.revoked_at = datetime.utcnow()
    
    # Create new tokens
    new_access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id), "email": user.email})
    
    # Calculate hash of new refresh token
    new_token_hash = hashlib.sha256(new_refresh_token.encode()).hexdigest()
    
    # Get expiration time for new refresh token
    new_payload = decode_token(new_refresh_token)
    expires_at = datetime.utcfromtimestamp(new_payload.get("exp", 0))
    
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
    
    # Create new API key record
    new_key_record = APIKey(
        user_id=user_id,
        key_hash=key_hash,
        name="Rotated key",
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
