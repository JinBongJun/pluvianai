"""
Force CORS headers middleware - ensures CORS headers are ALWAYS present
This is a fallback to ensure CORS works even if CORSMiddleware fails
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.core.logging_config import logger


class ForceCORSMiddleware(BaseHTTPMiddleware):
    """Middleware to FORCE CORS headers on ALL responses"""
    
    async def dispatch(self, request: Request, call_next):
        # Process request
        response: Response = await call_next(request)
        
        # FORCE CORS headers on ALL responses
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Expose-Headers"] = "*"
        response.headers["Access-Control-Max-Age"] = "3600"
        
        # Log OPTIONS requests for debugging
        if request.method == "OPTIONS":
            origin = request.headers.get("origin", "unknown")
            logger.info(f"FORCE CORS: OPTIONS {request.url.path} from origin: {origin}")
        
        return response
