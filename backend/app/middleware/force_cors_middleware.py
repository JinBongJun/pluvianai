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
        # Log ALL requests to verify they reach the server
        origin = request.headers.get("origin", "none")
        logger.info(f"🔵 FORCE CORS MIDDLEWARE: {request.method} {request.url.path} from origin: {origin}")
        
        # Process request
        response: Response = await call_next(request)
        
        # FORCE CORS headers on ALL responses - this MUST happen
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Expose-Headers"] = "*"
        response.headers["Access-Control-Max-Age"] = "3600"
        
        logger.info(f"🟢 FORCE CORS: Added headers to {request.method} {request.url.path}, status: {response.status_code}")
        
        return response
