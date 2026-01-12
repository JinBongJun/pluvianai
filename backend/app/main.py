"""
AgentGuard FastAPI Application
"""
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError
from app.core.config import settings
from app.core.database import engine, Base
from app.core.logging_config import logger

# Initialize Sentry before creating the app
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        integrations=[
            FastApiIntegration(),
            SqlalchemyIntegration(),
            HttpxIntegration(),
        ],
        # Set profiles_sample_rate to 1.0 to profile 100% of sampled transactions.
        # We recommend adjusting this value in production.
        profiles_sample_rate=1.0,
        # Enable sending of PII (Personally Identifiable Information)
        send_default_pii=False,
        # Set release version
        release=f"agentguard@{settings.APP_VERSION}",
    )
    logger.info(f"Sentry initialized for environment: {settings.SENTRY_ENVIRONMENT}")
else:
    logger.info("Sentry DSN not configured, skipping Sentry initialization")
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
    QualityScore, DriftDetection, Alert, Subscription, Usage,
    NotificationSettings
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

# CRITICAL: CORS middleware MUST be added LAST (last in list = first to execute)
# FastAPI middleware executes in REVERSE order (last added = first executed)
# CORS must handle preflight OPTIONS requests before any other middleware
# Always allow all origins to support Vercel preview deployments
# Vercel creates unique preview URLs for each deployment (e.g., agent-guard-xxx.vercel.app)
# Note: allow_credentials=False is required when allow_origins=["*"]
# Authorization header works fine with allow_credentials=False (it's not a cookie/credential)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Hardcoded to always allow all origins for flexibility
    allow_credentials=False,  # Must be False when using allow_origins=["*"]
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers including Authorization, Content-Type, etc.
    expose_headers=["*"],  # Expose all response headers to frontend
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Logging middleware (added after CORS so CORS handles preflight first)
app.add_middleware(LoggingMiddleware)

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
    
    # Safe migration: Add shadow_routing_config column if it doesn't exist
    # This handles the case where the column was added to the model but not migrated
    try:
        from sqlalchemy import text, inspect
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('projects')]
        
        if 'shadow_routing_config' not in columns:
            logger.info("Adding shadow_routing_config column to projects table...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE projects ADD COLUMN shadow_routing_config JSONB"))
                conn.commit()
            logger.info("Migration: shadow_routing_config column added")
    except Exception as e:
        # Column might already exist, which is fine
        if 'already exists' not in str(e).lower() and 'duplicate' not in str(e).lower():
            logger.warning(f"Migration check failed (non-critical): {str(e)}")
    
    # Start background scheduler
    from app.services.scheduler_service import scheduler_service
    scheduler_service.start()
    logger.info("Background scheduler started")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down AgentGuard API...")
    
    # Shutdown background scheduler
    from app.services.scheduler_service import scheduler_service
    scheduler_service.shutdown()
    
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

