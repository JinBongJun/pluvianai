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
                f"Unexpected error in {func.__name__}: {str(e)}",
                extra={"function": func.__name__, "func_args": str(args)[:200], "func_kwargs": str(kwargs)[:200]},  # Limit length
                exc_info=True,
            )
            # Raise HTTPException for FastAPI to handle
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred: {str(e)}"
            )

    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Unexpected error in {func.__name__}: {str(e)}",
                extra={"function": func.__name__, "func_args": str(args)[:200], "func_kwargs": str(kwargs)[:200]},
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred: {str(e)}"
            )

    # Return appropriate wrapper based on function type
    import inspect

    if inspect.iscoroutinefunction(func):
        return async_wrapper
    else:
        return sync_wrapper
