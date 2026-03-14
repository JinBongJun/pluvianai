"""
Decorators for common endpoint patterns
"""

from functools import wraps
from fastapi import HTTPException, status
from app.core.logging_config import logger


def handle_errors(func):
    """
    Decorator to handle errors in endpoints

    Automatically catches exceptions, logs them, and returns appropriate HTTP responses.
    HTTPException is re-raised as-is (handled by FastAPI exception handlers).
    """

    @wraps(func)
    async def async_wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except HTTPException:
            # Re-raise HTTPException - FastAPI handlers will catch it
            raise
        except Exception as e:
            # Log unexpected errors
            logger.error(
                f"Unexpected error in {func.__name__}: {type(e).__name__}",
                extra={"function": func.__name__},
                exc_info=True,
            )
            # Raise HTTPException for FastAPI to handle
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Unexpected error in {func.__name__}: {type(e).__name__}",
                extra={"function": func.__name__},
                exc_info=True,
            )
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

    # Return appropriate wrapper based on function type
    import inspect

    if inspect.iscoroutinefunction(func):
        return async_wrapper
    else:
        return sync_wrapper
