"""
Authentication endpoints
"""

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
from app.core.logging_config import logger
from app.core.dependencies import get_user_service, get_audit_service, get_audit_service
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError
from app.models.user import User
from app.models.login_attempt import LoginAttempt
from app.services.brute_force_protection import brute_force_service
from app.services.risk_based_auth import risk_based_auth_service
from app.services.password_policy import password_policy_service
from app.services.captcha_service import captcha_service
from app.core.metrics import (
    login_attempts_total,
    brute_force_blocks_total,
    risk_based_auth_challenges_total,
    password_policy_rejections_total,
    login_latency_seconds,
)
from app.core.analytics import analytics_service

router = APIRouter()


class UserCreate(BaseModel):
    """User registration schema"""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=72, description="Password (8-72 characters)")
    full_name: str | None = Field(None, max_length=255, description="Full name")
    liability_agreement_accepted: bool = Field(False, description="User must accept liability agreement")


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
async def register(
    user_data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    user_service = Depends(get_user_service),
    audit_service = Depends(get_audit_service)
):
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

    # Check liability agreement
    if not user_data.liability_agreement_accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must accept the liability agreement to register",
        )

    try:
        # Use service to create user (RequestDTO → Domain Model conversion)
        user = user_service.create_user(
            email=user_data.email,
            password=user_data.password,
            full_name=user_data.full_name
        )
        
        # Create user agreement record
        from app.models.user_agreement import UserAgreement
        from datetime import datetime
        agreement = UserAgreement(
            user_id=user.id,
            liability_agreement_accepted=True,
            liability_agreement_accepted_at=datetime.utcnow(),
            terms_of_service_accepted=True,
            terms_of_service_accepted_at=datetime.utcnow(),
            privacy_policy_accepted=True,
            privacy_policy_accepted_at=datetime.utcnow(),
        )
        db.add(agreement)
        
        # Track analytics event
        analytics_service.track_user_registration(
            user_id=user.id,
            email=user.email,
            plan="free",  # Default plan
        )
        
        # Log audit event
        ip_address = request.client.host if request and request.client else None
        user_agent = request.headers.get("user-agent") if request else None
        audit_service.log_action(
            user_id=user.id,
            action="user_registered",
            resource_type="user",
            resource_id=user.id,
            new_value={"email": user.email, "full_name": user.full_name},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        # Transaction is committed by get_db() dependency
        return user
    except EntityAlreadyExistsError as e:
        logger.warning(f"Registration failed: Email already exists - {user_data.email}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    request: Request = None,
    audit_service = Depends(get_audit_service),
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

    # Find user by email using service (OAuth2PasswordRequestForm uses username field for email)
    user_service = get_user_service(db)
    user = user_service.get_user_by_email(form_data.username)

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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")

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
    risk = risk_based_auth_service.assess(user.id, ip, user_agent, db=db)
    if risk.require_step_up:
        for reason in risk.reasons or ["high_risk"]:
            risk_based_auth_challenges_total.labels(reason=reason).inc()
        logger.warning(
            "High risk login detected",
            extra={"user_id": user.id, "ip": ip, "reasons": risk.reasons},
        )

    # Create tokens
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "email": user.email})

    # Save refresh token to database
    import hashlib
    from app.models.refresh_token import RefreshToken
    from datetime import datetime
    
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    payload = decode_token(refresh_token)
    expires_at = datetime.utcfromtimestamp(payload.get("exp", 0))
    
    refresh_token_record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        is_revoked=False
    )
    db.add(refresh_token_record)
    # Commit handled automatically by get_db() dependency

    # Log audit event for successful login
    audit_service.log_action(
        user_id=user.id,
        action="user_login",
        resource_type="user",
        resource_id=user.id,
        new_value={"email": user.email, "ip_address": ip, "user_agent": user_agent},
        ip_address=ip,
        user_agent=user_agent
    )

    duration = time.time() - start_time
    login_latency_seconds.observe(duration)

    # Track analytics event
    analytics_service.track_user_login(user_id=user.id, method="password")

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    token_data: TokenRefresh,
    request: Request,
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service)
):
    """Refresh access token using refresh token with rotation"""
    from app.core.security import rotate_refresh_token
    
    payload = decode_token(token_data.refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = int(payload.get("sub"))
    
    # Use rotation to issue new tokens (old token will be invalidated when token tracking is added)
    access_token, refresh_token = rotate_refresh_token(
        old_refresh_token=token_data.refresh_token,
        user_id=user_id,
        db=db
    )

    # Log audit event for token refresh
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    audit_service.log_action(
        user_id=user_id,
        action="token_refresh",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent
    )

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user
