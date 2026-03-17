"""
Authentication endpoints — standard login/register/JWT flow.

- Login: POST /login (OAuth2 form: username=email, password) → access_token + refresh_token.
- Register: POST /register (JSON) → 201 + user; password policy + liability check.
- Refresh: POST /refresh (body or cookie) → new tokens; refresh rotation + revoke old.
- Me: GET /me (Bearer or cookie) → current user.

Security: bcrypt passwords, JWT (HS256), brute-force protection, login attempts + audit.
"""

import time
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from app.core.config import settings
from app.core.database import get_db
from app.core.usage_limits import (
    get_snapshots_count_this_month,
    get_guard_credits_this_month,
    get_platform_replay_credits_this_month,
)
from app.services.subscription_service import SubscriptionService
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    auth_error_detail,
)
from app.core.logging_config import logger
from app.core.decorators import handle_errors
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
from app.utils.privacy import mask_email

router = APIRouter()
ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"


def _token_max_age_seconds(token: str, fallback_seconds: int) -> int:
    payload = decode_token(token)
    if not payload:
        return fallback_seconds

    exp = payload.get("exp")
    if not exp:
        return fallback_seconds

    try:
        max_age = int(exp) - int(datetime.utcnow().timestamp())
    except (TypeError, ValueError):
        return fallback_seconds

    return max(max_age, 0)


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    secure = settings.ENVIRONMENT == "production"
    cookie_domain = settings.AUTH_COOKIE_DOMAIN or None

    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        domain=cookie_domain,
        max_age=_token_max_age_seconds(
            access_token, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        ),
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        domain=cookie_domain,
        max_age=_token_max_age_seconds(
            refresh_token, settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
        ),
    )


def _clear_auth_cookies(response: Response) -> None:
    cookie_domain = settings.AUTH_COOKIE_DOMAIN or None
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/", domain=cookie_domain)
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/", domain=cookie_domain)


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

    refresh_token: str | None = None


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    user_service = Depends(get_user_service),
    audit_service = Depends(get_audit_service)
):
    """Register a new user"""
    logger.info(f"User registration attempt: {mask_email(user_data.email)}")

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
        
        # Commit user and agreement before analytics/audit
        db.commit()
        
        # Track analytics event (non-critical)
        try:
            analytics_service.track_user_registration(
                user_id=user.id,
                plan="free",  # Default plan
            )
        except Exception as e:
            logger.warning(f"Failed to track registration analytics: {e}")
        
        # Log audit event (non-critical)
        try:
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
        except Exception as e:
            logger.warning(f"Failed to log audit event: {e}")
        
        return user
    except EntityAlreadyExistsError as e:
        logger.warning(f"Registration failed: Email already exists - {mask_email(user_data.email)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service),
):
    """Login and get access token"""
    # CRITICAL: Log login attempt immediately - BEFORE any processing
    # This must be the FIRST thing to verify request reaches the endpoint
    origin = request.headers.get("origin", "none")
    ip = request.client.host if request and request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    # Log to both logger and stderr for maximum visibility
    import sys
    masked_email = mask_email(form_data.username)
    log_msg = f"🔴🔴🔴 LOGIN REQUEST RECEIVED: origin={origin}, email={masked_email}, ip={ip}"
    logger.info(log_msg)
    print(log_msg, file=sys.stderr)
    
    logger.info(
        f"LOGIN REQUEST RECEIVED: origin={origin}, email={masked_email}, ip={ip}",
        extra={
            "endpoint": "/api/v1/auth/login",
            "method": "POST",
            "origin": origin,
            "email": masked_email,
            "ip": ip,
            "user_agent": user_agent[:100] if user_agent else None,
        }
    )
    
    # Wrap entire function in try-except to catch ALL errors
    try:
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
        from app.core.dependencies import get_user_service
        user_service = get_user_service(db)
        user = user_service.get_user_by_email(form_data.username)

        # Log user lookup result for debugging
        password_valid = False
        if not user:
            logger.warning(f"🔴 LOGIN FAILED: User not found for email: {masked_email}")
            print(f"🔴 LOGIN FAILED: User not found for email: {masked_email}", file=sys.stderr)
        else:
            logger.info(f"✅ User found: id={user.id}, is_active={user.is_active}")
            print(f"✅ User found: id={user.id}, is_active={user.is_active}", file=sys.stderr)
            # Check password
            password_valid = verify_password(form_data.password, user.hashed_password)
            logger.info(f"🔐 Password verification completed for user_id={user.id}")
            print(f"🔐 Password verification completed for user_id={user.id}", file=sys.stderr)

        if not user or not password_valid:
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
                logger.warning(f"🔴 LOGIN BLOCKED: Too many attempts for {masked_email}")
                print(f"🔴 LOGIN BLOCKED: Too many attempts for {masked_email}", file=sys.stderr)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Try again in {result.wait_seconds} seconds.",
                )
            logger.warning(f"🔴 LOGIN FAILED: Invalid credentials for {masked_email}")
            print(f"🔴 LOGIN FAILED: Invalid credentials for {masked_email}", file=sys.stderr)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=auth_error_detail(
                    "invalid_credentials",
                    "Email or password is incorrect.",
                ),
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            logger.warning(f"🔴 LOGIN FAILED: User account is inactive for user_id={user.id}")
            print(f"🔴 LOGIN FAILED: User account is inactive for user_id={user.id}", file=sys.stderr)
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

        # Save refresh token to database (optional - if table doesn't exist, skip)
        try:
            import hashlib
            from datetime import datetime, timezone
            from app.models.refresh_token import RefreshToken

            token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
            payload = decode_token(refresh_token)
            exp_ts = payload.get("exp", 0) if payload else 0
            expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc)

            refresh_token_record = RefreshToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expires_at,
                is_revoked=False,
            )
            db.add(refresh_token_record)
            # Commit handled automatically by get_db() dependency
        except Exception as refresh_token_error:
            # If refresh token table doesn't exist or other error, log but don't fail login
            logger.warning(
                f"Failed to save refresh token (non-critical): {refresh_token_error}",
                exc_info=True,
            )

        # Log audit event for successful login (non-critical)
        try:
            audit_service.log_action(
                user_id=user.id,
                action="user_login",
                resource_type="user",
                resource_id=user.id,
                new_value={"email": user.email, "ip_address": ip, "user_agent": user_agent},
                ip_address=ip,
                user_agent=user_agent
            )
        except Exception as audit_error:
            logger.warning(f"Failed to log audit event (non-critical): {audit_error}", exc_info=True)

        duration = time.time() - start_time
        login_latency_seconds.observe(duration)

        # Track analytics event (non-critical)
        try:
            analytics_service.track_user_login(user_id=user.id, method="password")
        except Exception as analytics_error:
            logger.warning(f"Failed to track analytics event (non-critical): {analytics_error}", exc_info=True)

        # Always return tokens even if auxiliary operations fail
        logger.info(f"✅ LOGIN SUCCESS: user_id={user.id}")
        _set_auth_cookies(response, access_token, refresh_token)
        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}
    
    except HTTPException:
        # Re-raise HTTPException - FastAPI handlers will catch it
        raise
    except Exception as e:
        # Log unexpected errors with full traceback
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(
            f"🔴🔴🔴 LOGIN ERROR: {type(e).__name__}",
            extra={
                "endpoint": "/api/v1/auth/login",
                "method": "POST",
                "error_type": type(e).__name__,
                "traceback": error_traceback,
            },
            exc_info=True,
        )
        # Also print to stderr for Railway logs
        import sys
        print(f"🔴🔴🔴 LOGIN ERROR: {type(e).__name__}", file=sys.stderr)
        print(error_traceback, file=sys.stderr)
        # Raise HTTPException for FastAPI to handle
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    token_data: TokenRefresh = None,
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service)
):
    """Refresh access token using refresh token with rotation"""
    from app.core.security import rotate_refresh_token
    
    # Try to get refresh token from body first, then fallback to cookie
    refresh_token_str = None
    if token_data and token_data.refresh_token:
        refresh_token_str = token_data.refresh_token
        logger.info("🔵 [refresh_token] Token extracted from request body")
    else:
        refresh_token_str = request.cookies.get("refresh_token")
        if refresh_token_str:
            logger.info("🔵 [refresh_token] Token extracted from cookie")
        else:
            logger.warning("🔴 [refresh_token] No refresh_token found in body or cookie")

    if not refresh_token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "refresh_token_missing",
                "Refresh token is required to renew your session.",
            ),
        )
    
    payload = decode_token(refresh_token_str)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(
                "refresh_token_invalid",
                "Your login session is no longer valid. Please sign in again.",
            ),
        )

    user_id = int(payload.get("sub"))
    
    # Use rotation to issue new tokens
    access_token, refresh_token = rotate_refresh_token(
        old_refresh_token=refresh_token_str,
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

    _set_auth_cookies(response, access_token, refresh_token)
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    _clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return None


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user


@router.get("/me/usage")
async def get_my_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return current user's plan, limits, and usage this month.
    Billing/Usage uses this to show snapshot usage and hosted replay credit usage.
    """
    service = SubscriptionService(db)
    plan_info = service.get_user_plan(current_user.id)
    snapshots = get_snapshots_count_this_month(db, current_user.id)
    guard_credits = get_guard_credits_this_month(db, current_user.id)
    platform_replay_credits = get_platform_replay_credits_this_month(db, current_user.id)
    limits = plan_info.get("limits", {})
    # Aggregate usage metrics from Usage table (e.g., api_calls_per_month)
    summary = service.get_usage_summary(current_user.id)
    metrics = summary.get("metrics", {})
    api_calls_metric = metrics.get("api_calls", {})
    api_calls_current = int(api_calls_metric.get("current") or 0)
    api_calls_limit = api_calls_metric.get("limit")
    # Projects used: active, non-deleted projects owned by this user
    from app.models.project import Project
    projects_used = (
        db.query(Project)
        .filter(
            Project.owner_id == current_user.id,
            Project.is_active.is_(True),
            Project.is_deleted.is_(False),
        )
        .count()
    )
    return {
        "plan_type": plan_info.get("plan_type", "free"),
        "limits": limits,
        "usage_this_month": {
            "snapshots": snapshots,
            "guard_credits": guard_credits,
            "platform_replay_credits": platform_replay_credits,
            "api_calls": api_calls_current,
            "projects_used": int(projects_used),
            "api_calls_limit": api_calls_limit,
        },
    }
