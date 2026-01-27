"""
Logging middleware for request/response logging
"""

import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from app.core.logging_config import logger


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all requests and responses"""

    async def dispatch(self, request: Request, call_next):
        # Skip detailed logging for health checks and docs
        if request.url.path in ["/health", "/docs", "/openapi.json", "/redoc"]:
            return await call_next(request)
        
        # Log OPTIONS requests (CORS preflight) for debugging
        if request.method == "OPTIONS":
            origin = request.headers.get("origin", "unknown")
            logger.debug(f"CORS preflight: {request.method} {request.url.path} from origin: {origin}")
            try:
                response = await call_next(request)
                logger.debug(f"CORS preflight response: {response.status_code}, Access-Control-Allow-Origin: {response.headers.get('access-control-allow-origin', 'not set')}")
                return response
            except Exception as e:
                logger.error(f"CORS preflight error: {str(e)}", exc_info=True)
                raise

        # Record start time
        start_time = time.time()

        # Log request
        logger.info(
            f"Request: {request.method} {request.url.path}",
            extra={
                "method": request.method,
                "path": request.url.path,
                "query_params": str(request.query_params),
                "client": request.client.host if request.client else None,
            },
        )

        # Process request
        try:
            response = await call_next(request)

            # Calculate duration
            duration = time.time() - start_time

            # Log response
            logger.info(
                f"Response: {request.method} {request.url.path} - {response.status_code} - {duration:.3f}s",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration": duration,
                },
            )

            return response

        except Exception as e:
            # Calculate duration
            duration = time.time() - start_time

            # Log error
            logger.error(
                f"Error: {request.method} {request.url.path} - {str(e)} - {duration:.3f}s",
                extra={"method": request.method, "path": request.url.path, "duration": duration},
                exc_info=True,
            )
            raise
