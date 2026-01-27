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
        
        # Log ALL requests including OPTIONS (CORS preflight) for debugging
        origin = request.headers.get("origin", "unknown")
        ip = request.client.host if request.client else None
        
        if request.method == "OPTIONS":
            logger.info(f"CORS PREFLIGHT: {request.method} {request.url.path} from origin: {origin}, ip: {ip}")
            try:
                response = await call_next(request)
                logger.info(f"CORS PREFLIGHT RESPONSE: {response.status_code}, Access-Control-Allow-Origin: {response.headers.get('access-control-allow-origin', 'not set')}")
                return response
            except Exception as e:
                logger.error(f"CORS PREFLIGHT ERROR: {str(e)}", exc_info=True)
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
