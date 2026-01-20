"""
Custom exceptions and exception handlers
"""

from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from app.core.logging_config import logger


class AgentGuardException(Exception):
    """Base exception for AgentGuard"""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class NotFoundError(AgentGuardException):
    """Resource not found exception"""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=404)


class PermissionDeniedError(AgentGuardException):
    """Permission denied exception"""

    def __init__(self, message: str = "Permission denied"):
        super().__init__(message, status_code=403)


class ValidationError(AgentGuardException):
    """Validation error exception"""

    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status_code=400)


async def agentguard_exception_handler(request: Request, exc: AgentGuardException):
    """Handle custom AgentGuard exceptions"""
    logger.error(f"AgentGuardException: {exc.message}", extra={"path": request.url.path, "method": request.method})
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "message": exc.message, "status_code": exc.status_code},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions"""
    logger.warning(
        f"HTTPException: {exc.detail}",
        extra={"path": request.url.path, "method": request.method, "status_code": exc.status_code},
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "message": exc.detail, "status_code": exc.status_code},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    errors = exc.errors()
    # Extract more detailed error messages
    error_messages = []
    for error in errors:
        loc = " -> ".join(str(loc) for loc in error.get("loc", []))
        msg = error.get("msg", "Validation error")
        error_type = error.get("type", "unknown")
        error_messages.append(f"{loc}: {msg} (type: {error_type})")

    logger.warning(
        f"ValidationError: {error_messages}",
        extra={"path": request.url.path, "method": request.method, "query_params": dict(request.query_params)},
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": True,
            "message": "Validation error",
            "details": errors,
            "error_messages": error_messages,
            "status_code": 422,
        },
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """Handle SQLAlchemy exceptions"""
    logger.error(
        f"Database error: {str(exc)}", extra={"path": request.url.path, "method": request.method}, exc_info=True
    )

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }

    if isinstance(exc, IntegrityError):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error": True,
                "message": "Database integrity error. The resource may already exist.",
                "status_code": 409,
            },
            headers=cors_headers,
        )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": True, "message": "Database error occurred", "status_code": 500},
        headers=cors_headers,
    )


async def general_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions"""
    logger.error(
        f"Unhandled exception: {str(exc)}", extra={"path": request.url.path, "method": request.method}, exc_info=True
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": True, "message": "An unexpected error occurred", "status_code": 500},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )
