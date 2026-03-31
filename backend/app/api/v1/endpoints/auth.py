"""
Authentication endpoints — standard login/register/JWT flow.

- Login: POST /login (OAuth2 form: username=email, password) → access_token + refresh_token.
- Register: POST /register (JSON) → 201 + user; password policy + liability check.
- Refresh: POST /refresh (body or cookie) → new tokens; refresh rotation + revoke old.
- Me: GET /me (Bearer or cookie) → current user.

Security: bcrypt passwords, JWT (HS256), brute-force protection, login attempts + audit.
"""

import hashlib
import time
from datetime import datetime, timezone
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Query
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.core.config import settings
from app.core.database import get_db
from app.core.usage_limits import (
    get_release_gate_attempts_this_month,
    get_snapshots_count_this_month,
    get_guard_credits_this_month,
    get_platform_replay_credits_this_month,
)
from app.services.subscription_service import SubscriptionService
from app.services.entitlement_service import EntitlementService
from app.services.email_verification_service import EmailVerificationService
from app.services.google_oauth_service import GoogleOAuthService, OAUTH_STATE_COOKIE_NAME
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    generate_csrf_token,
    require_csrf_for_cookie_auth,
    auth_error_detail,
    CSRF_COOKIE_NAME,
)
from app.core.logging_config import logger
from app.core.decorators import handle_errors
from app.core.dependencies import get_user_service, get_audit_service
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError
from app.models.user import User
from app.models.login_attempt import LoginAttempt
from app.models.organization import Organization
from app.models.refresh_token import RefreshToken
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
        max_age = int(exp) - int(datetime.now(timezone.utc).timestamp())
    except (TypeError, ValueError):
        return fallback_seconds

    return max(max_age, 0)


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    secure = settings.ENVIRONMENT == "production"
    cookie_domain = settings.AUTH_COOKIE_DOMAIN or None
    csrf_token = generate_csrf_token()

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
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
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
    response.delete_cookie(CSRF_COOKIE_NAME, path="/", domain=cookie_domain)


def _set_oauth_state_cookie(response: Response, state_token: str) -> None:
    secure = settings.ENVIRONMENT == "production"
    cookie_domain = settings.AUTH_COOKIE_DOMAIN or None
    response.set_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        value=state_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        domain=cookie_domain,
        max_age=10 * 60,
    )


def _clear_oauth_state_cookie(response: Response) -> None:
    cookie_domain = settings.AUTH_COOKIE_DOMAIN or None
    response.delete_cookie(OAUTH_STATE_COOKIE_NAME, path="/", domain=cookie_domain)


def _safe_next_path(next_path: str | None) -> str:
    if next_path and next_path.startswith("/"):
        return next_path
    return "/organizations"


def _build_frontend_url(path: str) -> str:
    return f"{settings.APP_BASE_URL.rstrip('/')}{path}"


def _redirect_to_frontend(path: str) -> RedirectResponse:
    return RedirectResponse(url=_build_frontend_url(path), status_code=status.HTTP_302_FOUND)


def _issue_session_for_user(response: Response, user: User, db: Session) -> tuple[str, str]:
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "email": user.email})

    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    payload = decode_token(refresh_token)
    exp_ts = payload.get("exp", 0) if payload else 0
    expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc)

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_revoked=False,
        )
    )
    _set_auth_cookies(response, access_token, refresh_token)
    return access_token, refresh_token


def _ensure_user_agreement(user: User, db: Session) -> None:
    from app.models.user_agreement import UserAgreement

    existing = db.query(UserAgreement).filter(UserAgreement.user_id == user.id).first()
    if existing:
        return

    now = datetime.now(timezone.utc)
    db.add(
        UserAgreement(
            user_id=user.id,
            liability_agreement_accepted=True,
            liability_agreement_accepted_at=now,
            terms_of_service_accepted=True,
            terms_of_service_accepted_at=now,
            privacy_policy_accepted=True,
            privacy_policy_accepted_at=now,
        )
    )


class UserCreate(BaseModel):
    """User registration schema"""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=72, description="Password (8-72 characters)")
    full_name: str | None = Field(None, max_length=255, description="Full name")
    liability_agreement_accepted: bool = Field(False, description="User must accept liability agreement")


class UserResponse(BaseModel):
    """User response schema"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str | None
    avatar_url: str | None = None
    is_active: bool
    is_email_verified: bool
    primary_auth_provider: str = "password"
    password_login_enabled: bool = True
    google_login_enabled: bool = False

class TokenResponse(BaseModel):
    """Token response schema"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Token refresh schema"""

    refresh_token: str | None = None


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class VerifyEmailResponse(BaseModel):
    verified: bool
    purpose: str
    email: str


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
        agreement = UserAgreement(
            user_id=user.id,
            liability_agreement_accepted=True,
            liability_agreement_accepted_at=datetime.now(timezone.utc),
            terms_of_service_accepted=True,
            terms_of_service_accepted_at=datetime.now(timezone.utc),
            privacy_policy_accepted=True,
            privacy_policy_accepted_at=datetime.now(timezone.utc),
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

        try:
            _token, email_result = await EmailVerificationService(db).send_signup_verification(user)
            if email_result.get("status") != "sent":
                logger.warning(
                    "Signup verification email was not sent",
                    extra={"user_id": user.id, "email_status": email_result.get("status")},
                )
        except Exception as e:
            logger.warning(f"Failed to send signup verification email: {e}", exc_info=True)
        
        return user
    except EntityAlreadyExistsError as e:
        logger.warning(f"Registration failed: Email already exists - {mask_email(user_data.email)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )


@router.get("/oauth/google/start")
async def google_oauth_start(
    response: Response,
    intent: str = Query("login"),
    next: str | None = Query(None),
    terms_accepted: bool = Query(False),
):
    service = GoogleOAuthService()
    if not service.enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured.",
        )

    normalized_intent = intent if intent in {"login", "signup"} else "login"
    state_token = service.create_state_token(
        intent=normalized_intent,
        next_path=_safe_next_path(next),
        terms_accepted=terms_accepted,
    )
    redirect = RedirectResponse(
        url=service.build_authorization_url(state_token=state_token),
        status_code=status.HTTP_302_FOUND,
    )
    _set_oauth_state_cookie(redirect, state_token)
    return redirect


@router.get("/oauth/google/callback")
async def google_oauth_callback(
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
    user_service = Depends(get_user_service),
    audit_service = Depends(get_audit_service),
):
    service = GoogleOAuthService()

    def _error_redirect(message: str, *, signup: bool = False) -> RedirectResponse:
        params = {"oauth_error": "1", "oauth_error_message": message}
        if signup:
            params["mode"] = "signup"
        redirect = _redirect_to_frontend(f"/login?{urlencode(params)}")
        _clear_oauth_state_cookie(redirect)
        return redirect

    if not service.enabled:
        return _error_redirect("Google sign-in is not configured.")
    if error:
        return _error_redirect("Google sign-in was cancelled or denied.")
    if not code or not state:
        return _error_redirect("Google sign-in could not be completed.")

    state_payload, state_error = service.validate_state_token(
        state_token=state,
        cookie_state_token=request.cookies.get(OAUTH_STATE_COOKIE_NAME),
    )
    if state_error or not state_payload:
        return _error_redirect("Google sign-in state is invalid. Please try again.")

    signup_intent = state_payload.get("intent") == "signup"
    next_path = _safe_next_path(state_payload.get("next_path"))
    terms_accepted = bool(state_payload.get("terms_accepted"))

    try:
        identity = await service.get_identity_from_code(code)
    except Exception as exc:
        logger.warning("Google OAuth callback failed", exc_info=True)
        return _error_redirect("Google sign-in could not be completed.")

    user = db.query(User).filter(User.google_id == identity.google_id).first()
    created = False
    linked = False

    if not user:
        user = db.query(User).filter(User.email == identity.email).first()
        if user:
            existing_google_owner = (
                db.query(User)
                .filter(User.google_id == identity.google_id, User.id != user.id)
                .first()
            )
            if existing_google_owner:
                return _error_redirect("This Google account is already linked to another user.")
            user.google_id = identity.google_id
            user.google_login_enabled = True
            user.is_email_verified = True
            if not user.avatar_url and identity.avatar_url:
                user.avatar_url = identity.avatar_url
            if not user.full_name and identity.full_name:
                user.full_name = identity.full_name
            linked = True
        else:
            if not terms_accepted:
                return _error_redirect(
                    "To create a new account with Google, accept the terms first.",
                    signup=True,
                )
            user = user_service.create_google_user(
                email=identity.email,
                full_name=identity.full_name,
                google_id=identity.google_id,
                avatar_url=identity.avatar_url,
            )
            _ensure_user_agreement(user, db)
            created = True

    if not user.is_active:
        return _error_redirect("This account is inactive. Contact support if you need access.")

    user.is_email_verified = True
    if not user.full_name and identity.full_name:
        user.full_name = identity.full_name
    if not user.avatar_url and identity.avatar_url:
        user.avatar_url = identity.avatar_url
    if not bool(getattr(user, "password_login_enabled", True)):
        user.primary_auth_provider = "google"
    elif user.primary_auth_provider not in {"password", "google"}:
        user.primary_auth_provider = "password"

    redirect = _redirect_to_frontend(next_path)
    _clear_oauth_state_cookie(redirect)
    _issue_session_for_user(redirect, user, db)

    try:
        if created:
            analytics_service.track_user_registration(user_id=user.id, plan="free")
        analytics_service.track_user_login(user_id=user.id, method="google")
    except Exception:
        logger.warning("Failed to track Google auth analytics", exc_info=True)

    try:
        if created:
            audit_service.log_action(
                user_id=user.id,
                action="user_registered_google",
                resource_type="user",
                resource_id=user.id,
                new_value={"email": user.email, "full_name": user.full_name},
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
        elif linked:
            audit_service.log_action(
                user_id=user.id,
                action="google_account_linked",
                resource_type="user",
                resource_id=user.id,
                new_value={"email": user.email},
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
        audit_service.log_action(
            user_id=user.id,
            action="user_login_google",
            resource_type="user",
            resource_id=user.id,
            new_value={"email": user.email},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        logger.warning("Failed to write Google auth audit logs", exc_info=True)

    return redirect


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
            if not bool(getattr(user, "password_login_enabled", True)):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=auth_error_detail(
                        "google_sign_in_required",
                        "Use Google sign-in for this account.",
                    ),
                )
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

        if not bool(getattr(user, "is_email_verified", True)):
            login_attempts_total.labels(outcome="failure", reason="email_not_verified").inc()
            db.add(
                LoginAttempt(
                    user_id=user.id,
                    email=user.email,
                    ip_address=ip,
                    user_agent=user_agent,
                    is_success=False,
                    failure_reason="email_not_verified",
                )
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=auth_error_detail(
                    "email_not_verified",
                    "Verify your email before signing in.",
                ),
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
        risk = risk_based_auth_service.assess(user.id, ip, user_agent, db=db)
        if risk.require_step_up:
            for reason in risk.reasons or ["high_risk"]:
                risk_based_auth_challenges_total.labels(reason=reason).inc()
            logger.warning(
                "High risk login detected",
                extra={"user_id": user.id, "ip": ip, "reasons": risk.reasons},
            )

        # Create tokens and persist refresh token
        access_token, refresh_token = _issue_session_for_user(response, user, db)

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
    _csrf: None = Depends(require_csrf_for_cookie_auth),
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
async def logout(
    response: Response,
    _csrf: None = Depends(require_csrf_for_cookie_auth),
):
    _clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return None


@router.get("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    token: str = Query(..., min_length=8),
    db: Session = Depends(get_db),
):
    result, err = EmailVerificationService(db).consume_token(token)
    if err == "invalid_token":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verification link is invalid.")
    if err == "token_already_used":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Verification link was already used.")
    if err == "token_expired":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Verification link has expired.")
    if err == "email_taken":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That email is already in use.")
    raise_if = {"user_not_found", "invalid_purpose"}
    if err in raise_if or not result:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not verify email.")
    return VerifyEmailResponse(**result)


@router.post("/verify-email/resend")
async def resend_verification_email(
    body: ResendVerificationRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == body.email).first()
    if user and not bool(getattr(user, "is_email_verified", True)):
        try:
            await EmailVerificationService(db).send_signup_verification(user)
        except Exception:
            logger.warning("Failed to resend verification email", exc_info=True)
    return {"message": "If this account exists, a verification email has been sent."}


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
    Return current user's plan, limits, and usage for the active quota window (billing period or calendar month).
    Billing/Usage uses this to show snapshot usage and hosted replay credit usage.
    """
    service = SubscriptionService(db)
    plan_info = service.get_user_plan(current_user.id)
    entitlement = EntitlementService(db).get_or_create_current_entitlement(current_user.id, source="usage_read")
    snapshots = get_snapshots_count_this_month(db, current_user.id)
    release_gate_attempts = get_release_gate_attempts_this_month(db, current_user.id)
    guard_credits = get_guard_credits_this_month(db, current_user.id)
    platform_replay_credits = get_platform_replay_credits_this_month(db, current_user.id)
    limits = entitlement.limits_json or plan_info.get("limits", {})
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
    organizations_used = (
        db.query(Organization)
        .filter(
            Organization.owner_id == current_user.id,
            Organization.is_deleted.is_(False),
        )
        .count()
    )
    return {
        "plan_type": entitlement.effective_plan_id,
        "display_plan_type": entitlement.effective_plan_id,
        "subscription_status": plan_info.get("status", "active"),
        "entitlement_status": entitlement.entitlement_status,
        "current_period_start": plan_info.get("current_period_start"),
        "current_period_end": plan_info.get("current_period_end"),
        "entitlement_effective_from": entitlement.effective_from.isoformat(),
        "entitlement_effective_to": entitlement.effective_to.isoformat() if entitlement.effective_to else None,
        "limits": limits,
        "usage_this_month": {
            "snapshots": snapshots,
            "release_gate_attempts": release_gate_attempts,
            "guard_credits": guard_credits,
            "platform_replay_credits": platform_replay_credits,
            "api_calls": api_calls_current,
            "projects_used": int(projects_used),
            "organizations_used": int(organizations_used),
            "api_calls_limit": api_calls_limit,
        },
    }
