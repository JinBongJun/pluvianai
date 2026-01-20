"""
Authentication endpoints
"""
from datetime import timedelta
import time
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
)
from app.core.config import settings
from app.core.logging_config import logger
from app.core.decorators import handle_errors
from app.models.user import User
from app.models.login_attempt import LoginAttempt
from app.services.brute_force_protection import brute_force_service
from app.services.risk_based_auth import risk_based_auth_service
from app.services.password_policy import password_policy_service
from app.services.captcha_service import captcha_service
from app.core.metrics import (
    login_attempts_total,
    brute_force_blocks_total,
    account_lockouts_total,
    risk_based_auth_challenges_total,
    password_policy_rejections_total,
    login_latency_seconds,
)

router = APIRouter()


class UserCreate(BaseModel):
    """User registration schema"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=72, description="Password (8-72 characters)")
    full_name: str | None = Field(None, max_length=255, description="Full name")


class UserResponse(BaseModel):
    """User response schema"""
    id: int
    email: str
    full_name: str | None
    is_active: bool
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Token response schema"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Token refresh schema"""
    refresh_token: str


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    logger.info(f"User registration attempt: {user_data.email}")
    
    # Enforce password policy
    policy_result = password_policy_service.validate(user_data.password)
    if not policy_result.valid:
        for reason in policy_result.reasons:
            password_policy_rejections_total.labels(reason=reason).inc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Password policy violation", "reasons": policy_result.reasons},
        )

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        logger.warning(f"Registration failed: Email already exists - {user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        is_active=True
    )
    db.add(user)
    db.flush()  # Flush to get user.id
    
    # Create free plan subscription for new user
    from app.models.subscription import Subscription
    from datetime import datetime, timedelta
    
    now = datetime.utcnow()
    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        period_end = period_start.replace(year=now.year + 1, month=1)
    else:
        period_end = period_start.replace(month=now.month + 1)
    
    subscription = Subscription(
        user_id=user.id,
        plan_type="free",
        status="active",
        current_period_start=period_start,
        current_period_end=period_end,
        cancel_at_period_end="false"
    )
    db.add(subscription)
    db.commit()
    db.refresh(user)
    logger.info(f"User registered successfully: {user.email}")
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Login and get access token"""
    start_time = time.time()
    ip = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None

    # Brute force pre-check
    precheck = brute_force_service.check_allowed(form_data.username, ip)
    if not precheck.allowed:
        if precheck.require_captcha:
            captcha_token = request.headers.get("X-Captcha-Token") if request else None
            captcha_ok = await captcha_service.verify(captcha_token)
            if captcha_ok:
                brute_force_service.register_success(form_data.username, ip)
            else:
                brute_force_blocks_total.labels(reason=precheck.reason or "rate_limited").inc()
                login_attempts_total.labels(outcome="blocked", reason="captcha_required").inc()
                db.add(
                    LoginAttempt(
                        email=form_data.username,
                        ip_address=ip,
                        user_agent=user_agent,
                        is_success=False,
                        failure_reason="captcha_required",
                    )
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many attempts. Complete CAPTCHA to continue.",
                )
        else:
            brute_force_blocks_total.labels(reason=precheck.reason or "rate_limited").inc()
            login_attempts_total.labels(outcome="blocked", reason=precheck.reason or "rate_limited").inc()
            db.add(
                LoginAttempt(
                    email=form_data.username,
                    ip_address=ip,
                    user_agent=user_agent,
                    is_success=False,
                    failure_reason=precheck.reason or "rate_limited",
                )
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Try again in {precheck.wait_seconds} seconds.",
            )

    # Find user by email (OAuth2PasswordRequestForm uses username field for email)
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        result = brute_force_service.register_failure(form_data.username, ip)
        login_attempts_total.labels(outcome="failure", reason="invalid_credentials").inc()
        db.add(
            LoginAttempt(
                email=form_data.username,
                ip_address=ip,
                user_agent=user_agent,
                is_success=False,
                failure_reason="invalid_credentials",
            )
        )
        if not result.allowed:
            brute_force_blocks_total.labels(reason=result.reason or "rate_limited").inc()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Try again in {result.wait_seconds} seconds.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        login_attempts_total.labels(outcome="failure", reason="inactive").inc()
        db.add(
            LoginAttempt(
                user_id=user.id,
                email=user.email,
                ip_address=ip,
                user_agent=user_agent,
                is_success=False,
                failure_reason="inactive",
            )
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Success path
    brute_force_service.register_success(user.email, ip)
    db.add(
        LoginAttempt(
            user_id=user.id,
            email=user.email,
            ip_address=ip,
            user_agent=user_agent,
            is_success=True,
        )
    )
    login_attempts_total.labels(outcome="success", reason="none").inc()

    # Risk-based assessment (informational)
    risk = risk_based_auth_service.assess(user.id, ip, user_agent)
    if risk.require_step_up:
        for reason in risk.reasons or ["high_risk"]:
            risk_based_auth_challenges_total.labels(reason=reason).inc()
        logger.warning(
            "High risk login detected",
            extra={"user_id": user.id, "ip": ip, "reasons": risk.reasons},
        )

    # Create tokens
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id), "email": user.email}
    )

    duration = time.time() - start_time
    login_latency_seconds.observe(duration)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(token_data: TokenRefresh, db: Session = Depends(get_db)):
    """Refresh access token using refresh token"""
    payload = decode_token(token_data.refresh_token)
    
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == int(user_id)).first()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Create new tokens
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id), "email": user.email}
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user



