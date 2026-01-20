"""
Gzip compression middleware for API responses
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import gzip


class GZipMiddleware(BaseHTTPMiddleware):
    """Middleware to compress responses with Gzip"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Only compress if client accepts gzip
        accept_encoding = request.headers.get("Accept-Encoding", "")
        if "gzip" not in accept_encoding:
            return response

        # Only compress JSON and text responses
        content_type = response.headers.get("Content-Type", "")
        if not any(ct in content_type for ct in ["application/json", "text/", "application/javascript"]):
            return response

        # Only compress if response is large enough (>1KB)
        if hasattr(response, "body"):
            body = response.body
            if len(body) < 1024:  # Less than 1KB, don't compress
                return response

            # Compress the body
            compressed_body = gzip.compress(body, compresslevel=6)

            # Create new response with compressed body
            compressed_response = Response(
                content=compressed_body,
                status_code=response.status_code,
                headers={**response.headers, "Content-Encoding": "gzip", "Content-Length": str(len(compressed_body))},
                media_type=response.media_type,
            )
            return compressed_response

        return response
