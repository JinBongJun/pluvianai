"""
Custom exceptions and exception handlers
"""

from typing import Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from app.core.logging_config import logger
from app.services.ops_alerting import ops_alerting


class PluvianAIException(Exception):
    """Base exception for PluvianAI"""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class NotFoundError(PluvianAIException):
    """Resource not found exception"""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=404)


class PermissionDeniedError(PluvianAIException):
    """Permission denied exception"""

    def __init__(self, message: str = "Permission denied"):
        super().__init__(message, status_code=403)


class ValidationError(PluvianAIException):
    """Validation error exception"""

    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status_code=400)


class UpgradeRequiredException(PluvianAIException):
    """Upgrade required exception for Pro/Enterprise features"""

    def __init__(
        self,
        message: str = "This feature requires a higher plan",
        current_plan: str = "free",
        required_plan: str = "pro",
        feature: Optional[str] = None,
        upgrade_url: Optional[str] = None,
    ):
        self.current_plan = current_plan
        self.required_plan = required_plan
        self.feature = feature
        self.upgrade_url = upgrade_url or f"/settings/subscription?upgrade={required_plan}"
        super().__init__(message, status_code=403)


async def pluvianai_exception_handler(request: Request, exc: PluvianAIException):
    """Handle custom PluvianAI exceptions following API_REFERENCE.md format"""
    logger.error(f"PluvianAIException: {exc.message}", extra={"path": request.url.path, "method": request.method})
    
    from app.core.responses import error_response
    
    # Special handling for UpgradeRequiredException
    if isinstance(exc, UpgradeRequiredException):
        headers = {"X-Upgrade-Required": "true"}
        return error_response(
            code="UPGRADE_REQUIRED",
            message=exc.message,
            details={
                "current_plan": exc.current_plan,
                "required_plan": exc.required_plan,
                "feature": exc.feature,
                "upgrade_url": exc.upgrade_url,
            },
            status_code=exc.status_code,
            origin="Proxy",  # PluvianAI server error
            headers=headers,
        )
    
    # Determine error code based on exception type
    error_code = "PLUVIANAI_ERROR"
    if isinstance(exc, NotFoundError):
        error_code = "NOT_FOUND"
    elif isinstance(exc, PermissionDeniedError):
        error_code = "PERMISSION_DENIED"
    elif isinstance(exc, ValidationError):
        error_code = "VALIDATION_ERROR"
    
    return error_response(
        code=error_code,
        message=exc.message,
        status_code=exc.status_code,
        origin="Proxy",  # PluvianAI server error
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions following API_REFERENCE.md format.
    When detail is a dict with 'message', use it as user-visible explanation so UI can show why the error occurred.
    """
    logger.warning(
        f"HTTPException: {exc.detail}",
        extra={"path": request.url.path, "method": request.method, "status_code": exc.status_code},
    )
    detail = exc.detail
    # User-visible message: prefer detail["message"] when detail is a dict (e.g. limit errors)
    if isinstance(detail, dict) and "message" in detail:
        user_message = detail["message"]
        details = detail  # Keep code, limit, requested etc. for UI
    else:
        user_message = str(detail) if detail else "An error occurred"
        details = None
    # Error code: prefer detail["code"] (e.g. LIMIT_INPUTS_PER_TEST) when present
    error_code = f"HTTP_{exc.status_code}"
    if isinstance(detail, dict) and "code" in detail:
        error_code = detail["code"]
    elif hasattr(exc, "error_code"):
        error_code = exc.error_code
    origin = request.headers.get("X-PluvianAI-Origin")
    from app.core.responses import error_response
    return error_response(
        code=error_code,
        message=user_message,
        details=details,
        origin=origin,
        status_code=exc.status_code,
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors following API_REFERENCE.md format"""
    errors = exc.errors()
    summarized_errors = []
    for error in errors:
        loc = " -> ".join(str(loc) for loc in error.get("loc", []))
        msg = error.get("msg", "Validation error")
        error_type = error.get("type", "unknown")
        summarized_errors.append(
            {
                "field": loc,
                "message": msg,
                "type": error_type,
            }
        )

    logger.warning(
        f"ValidationError: {summarized_errors}",
        extra={"path": request.url.path, "method": request.method, "query_params": dict(request.query_params)},
    )

    from app.core.responses import error_response
    details = (
        {"errors": errors, "error_messages": summarized_errors}
        if request.app and getattr(request.app.state, "expose_debug_details", False)
        else {"errors": summarized_errors}
    )
    return error_response(
        code="VALIDATION_ERROR",
        message="Validation error",
        details=details,
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        origin="Proxy",  # PluvianAI validation error
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """Handle SQLAlchemy exceptions following API_REFERENCE.md format"""
    logger.error(
        f"Database error: {str(exc)}", extra={"path": request.url.path, "method": request.method}, exc_info=True
    )
    ops_alerting.observe_db_error(type(exc).__name__)

    from app.core.responses import error_response

    if isinstance(exc, IntegrityError):
        return error_response(
            code="DATABASE_INTEGRITY_ERROR",
            message="Database integrity error. The resource may already exist.",
            status_code=status.HTTP_409_CONFLICT,
            origin="Proxy",  # PluvianAI database error
        )

    return error_response(
        code="DATABASE_ERROR",
        message="Database error occurred",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        origin="Proxy",  # PluvianAI database error
    )


async def general_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions following API_REFERENCE.md format"""
    logger.error(
        f"Unhandled exception: {str(exc)}", extra={"path": request.url.path, "method": request.method}, exc_info=True
    )
    
    from app.core.responses import error_response
    return error_response(
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        origin="Proxy",  # PluvianAI server error
    )
