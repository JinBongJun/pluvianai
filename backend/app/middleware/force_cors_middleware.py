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
        
        # FORCE CORS headers on ALL responses
        # For cookie-based authentication, we need to:
        # 1. Reflect the origin (not use "*")
        # 2. Set Access-Control-Allow-Credentials to "true"
        # 3. Explicitly list allowed headers (not "*") when using credentials
        allow_headers = "Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Allow-Origin, Access-Control-Allow-Credentials"
        
        if origin and origin != "none":
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        else:
            # Fallback for requests without origin or server-to-server requests
            # Still set credentials to true to allow cookie-based auth if possible
            # But reflect localhost:3000 as the primary consumer
            response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD"
        response.headers["Access-Control-Allow-Headers"] = allow_headers
        response.headers["Access-Control-Expose-Headers"] = "*"
        response.headers["Access-Control-Max-Age"] = "3600"
        
        logger.info(f"🟢 FORCE CORS: Added headers to {request.method} {request.url.path}, status: {response.status_code}, origin: {origin}")
        
        return response
