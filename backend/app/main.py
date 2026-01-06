"""
AgentGuard FastAPI Application
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError
from app.core.config import settings
from app.core.database import engine, Base
from app.core.logging_config import logger
from app.core.exceptions import (
    AgentGuardException,
    agentguard_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    sqlalchemy_exception_handler,
    general_exception_handler
)
from app.api.v1 import api_router
from app.middleware.api_hook import APIHookMiddleware
from app.middleware.gzip_middleware import GZipMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.logging_middleware import LoggingMiddleware

# Import all models to ensure they are registered with Base
from app.models import (
    User, Project, ProjectMember, APIKey, APICall,
    QualityScore, DriftDetection, Alert
)

# Create database tables
# This will be moved to Alembic migrations later
# Use /api/v1/admin/init-db endpoint to initialize database after deployment
# Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    description="LLM Agent Monitoring Platform",
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

# Add exception handlers
app.add_exception_handler(AgentGuardException, agentguard_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# Logging middleware (should be first to log all requests)
app.add_middleware(LoggingMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gzip compression middleware (reduce bandwidth)
app.add_middleware(GZipMiddleware)

# Rate limiting middleware (prevent abuse)
app.add_middleware(RateLimitMiddleware, requests_per_minute=60)

# API Hook middleware for capturing LLM API calls
app.add_middleware(APIHookMiddleware, enabled=True)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    """Initialize database connection on startup"""
    logger.info("Starting AgentGuard API...")
    logger.info(f"Environment: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")
    # Create database tables (for development)
    # In production, use Alembic migrations instead
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down AgentGuard API...")
    # Additional cleanup tasks can be added here


@app.get("/")
async def root():
    return {
        "message": settings.APP_NAME,
        "version": settings.APP_VERSION
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}

