"""
Logging middleware for request/response logging
"""

import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from app.core.logging_config import logger
from app.services.ops_alerting import ops_alerting


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all requests and responses"""

    @staticmethod
    def _extract_project_api_scope(path: str) -> tuple[int, str] | None:
        # Expected shape: /api/v1/projects/{project_id}/{endpoint_group}/...
        parts = [p for p in (path or "").split("/") if p]
        if len(parts) < 5:
            return None
        if parts[:3] != ["api", "v1", "projects"]:
            return None
        try:
            project_id = int(parts[3])
        except Exception:
            return None
        endpoint_group = str(parts[4] or "").strip().lower()
        if endpoint_group not in {"live-view", "release-gate"}:
            return None
        return project_id, endpoint_group.replace("-", "_")

    @staticmethod
    def _extract_live_view_project_id(path: str) -> int | None:
        # Expected shape: /api/v1/projects/{project_id}/live-view/agents
        parts = [p for p in (path or "").split("/") if p]
        if len(parts) < 6:
            return None
        if parts[:3] != ["api", "v1", "projects"]:
            return None
        if parts[4:6] != ["live-view", "agents"]:
            return None
        try:
            return int(parts[3])
        except Exception:
            return None

    async def dispatch(self, request: Request, call_next):
        # Log ALL requests immediately - even before processing
        origin = request.headers.get("origin", "none")
        ip = request.client.host if request.client else "unknown"
        # Enhanced logging for API endpoints to debug routing issues
        if request.url.path.startswith("/api/v1/"):
            logger.info(f"🟡 LOGGING MIDDLEWARE: {request.method} {request.url.path} from origin: {origin}, ip: {ip}")
        else:
            logger.debug(f"🟡 LOGGING MIDDLEWARE: {request.method} {request.url.path} from origin: {origin}, ip: {ip}")
        
        # Skip detailed logging for health checks and docs (but still log that they were accessed)
        if request.url.path in ["/health", "/docs", "/openapi.json", "/redoc"]:
            response = await call_next(request)
            logger.info(f"🟢 Health/docs request: {request.method} {request.url.path} - {response.status_code}")
            return response
        
        # Log ALL requests including OPTIONS (CORS preflight) for debugging
        if request.method == "OPTIONS":
            logger.info(f"🟠 CORS PREFLIGHT: {request.method} {request.url.path} from origin: {origin}, ip: {ip}")
            try:
                response = await call_next(request)
                cors_header = response.headers.get('access-control-allow-origin', 'NOT SET')
                logger.info(f"🟢 CORS PREFLIGHT RESPONSE: {response.status_code}, Access-Control-Allow-Origin: {cors_header}")
                return response
            except Exception as e:
                logger.error(f"🔴 CORS PREFLIGHT ERROR: {str(e)}", exc_info=True)
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

            # MVP ops alert: observe live-view agents endpoint degradation.
            project_id = self._extract_live_view_project_id(request.url.path)
            if project_id is not None:
                ops_alerting.observe_live_view_agents_request(
                    project_id=project_id,
                    status_code=int(response.status_code),
                    duration_ms=float(duration * 1000.0),
                )
            project_scope = self._extract_project_api_scope(request.url.path)
            if project_scope is not None:
                scoped_project_id, endpoint_group = project_scope
                ops_alerting.observe_project_api_request(
                    project_id=scoped_project_id,
                    endpoint_group=endpoint_group,
                    status_code=int(response.status_code),
                    duration_ms=float(duration * 1000.0),
                )

            # CRITICAL: Debug log headers for any 401 response
            if response.status_code == 401:
                auth_header = request.headers.get("authorization")
                all_headers = dict(request.headers)
                # Redact most of the header if present
                redacted_auth = f"{auth_header[:25]}..." if auth_header else "MISSING"
                from app.core.config import settings
                logger.warning(
                    f"🔴 401 UNAUTHORIZED DEBUG: Header: {redacted_auth}, "
                    f"Path: {request.url.path}, Origin: {request.headers.get('origin')}, "
                    f"SecretKeyLen: {len(settings.SECRET_KEY)}"
                )
                logger.debug(f"🔍 [401 All Headers]: {all_headers}")

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
