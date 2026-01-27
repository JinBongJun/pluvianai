"""
AgentGuard FastAPI Application
"""

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError
from app.core.config import settings
from app.core.database import engine, Base, check_database_health
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
    general_exception_handler,
)
from app.api.v1 import api_router
from app.api.v2 import api_router_v2
from app.middleware.api_hook import APIHookMiddleware
from app.middleware.gzip_middleware import GZipMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.logging_middleware import LoggingMiddleware
from app.middleware.metrics_middleware import MetricsMiddleware
from app.middleware.security_middleware import SecurityHeadersMiddleware
from app.core.metrics import update_app_info
from app.services.cache_service import cache_service

# Import all models to ensure they are registered with Base
# Models are imported here to ensure SQLAlchemy Base metadata includes them
# Individual models are imported where needed
from app.models import (  # noqa: F401
    User,
    Project,
    ProjectMember,
    APIKey,
    APICall,
    QualityScore,
    DriftDetection,
    Alert,
    Subscription,
    Usage,
    NotificationSettings,
    LoginAttempt,
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
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Update app info metrics
update_app_info(settings.APP_VERSION, settings.SENTRY_ENVIRONMENT)

# Add exception handlers
app.add_exception_handler(AgentGuardException, agentguard_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# CRITICAL: CORS middleware MUST be added LAST (last in list = first to execute)
# FastAPI middleware executes in REVERSE order (last added = first executed)
# CORS must handle preflight OPTIONS requests before any other middleware
# Parse CORS_ORIGINS from settings (supports comma-separated list or "*")
cors_origins = settings.cors_origins_list

# For Vercel preview deployments, always allow all origins to avoid CORS issues
# Vercel creates new preview URLs for each deployment, making it impractical to whitelist
# In production with a fixed domain, you can set CORS_ORIGINS to specific domains
if not cors_origins or cors_origins == ["*"] or any("vercel.app" in str(origin) for origin in cors_origins):
    # Allow all origins (for development/Vercel preview deployments)
    allow_origins = ["*"]
    allow_credentials = False  # Must be False when using allow_origins=["*"]
    logger.info("CORS configured to allow all origins (*) - Vercel preview mode")
else:
    # Specific origins (for production with fixed domain)
    allow_origins = cors_origins
    allow_credentials = True  # Can use credentials with specific origins
    logger.info(f"CORS configured with specific origins: {allow_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],  # Explicitly allow all methods
    allow_headers=["*"],  # Allow all headers including Authorization, Content-Type, etc.
    expose_headers=["*"],  # Expose all response headers to frontend
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Logging middleware (added immediately after CORS to catch all requests)
# This MUST be early in the chain to log requests even if they fail later
app.add_middleware(LoggingMiddleware)

# Security headers middleware (add security headers to all responses)
app.add_middleware(SecurityHeadersMiddleware)

# Metrics middleware (collect API metrics)
app.add_middleware(MetricsMiddleware)

# Gzip compression middleware (reduce bandwidth)
app.add_middleware(GZipMiddleware)

# Rate limiting middleware (prevent abuse)
app.add_middleware(RateLimitMiddleware, requests_per_minute=60)

# API Hook middleware for capturing LLM API calls
app.add_middleware(APIHookMiddleware, enabled=True)

# Include API routers
app.include_router(api_router, prefix="/api/v1")

# Include API v2 router (for future breaking changes)
# v2 is currently in development - v1 remains stable
app.include_router(api_router_v2, prefix="/api/v2")

# Add deprecation notice middleware for v1 (when v2 alternatives exist)
# This will be enabled when specific v1 endpoints are deprecated
@app.middleware("http")
async def add_api_version_headers(request, call_next):
    """Add API version headers for versioning strategy"""
    response = await call_next(request)
    
    # Add API version header
    if request.url.path.startswith("/api/v1"):
        response.headers["X-API-Version"] = "v1"
        response.headers["X-API-Status"] = "stable"
    elif request.url.path.startswith("/api/v2"):
        response.headers["X-API-Version"] = "v2"
        response.headers["X-API-Status"] = "development"
    
    # Future: Add deprecation notice when v1 endpoints are deprecated
    # Example:
    # if request.url.path.startswith("/api/v1/deprecated-endpoint"):
    #     response.headers["X-API-Deprecation"] = "This endpoint will be deprecated on 2026-06-01. Migrate to /api/v2/..."
    #     response.headers["X-API-Deprecation-Date"] = "2026-06-01"
    #     response.headers["X-API-Migration-Guide"] = "https://docs.agentguard.dev/api/migration/v1-to-v2"
    
    return response


# Note: startup_event is defined below (line 237) - duplicate removed


async def update_business_metrics_periodically():
    """Periodically update business metrics (active users, projects)"""
    import asyncio
    from app.core.database import SessionLocal

    # Import User and Project here to avoid F811 redefinition error
    from app.models.user import User  # noqa: F811
    from app.models.project import Project  # noqa: F811
    from app.core.metrics import active_users, active_projects

    while True:
        try:
            db = SessionLocal()
            try:
                # Count active users (users with is_active=True)
                user_count = db.query(User).filter(User.is_active.is_(True)).count()
                active_users.set(user_count)

                # Count active projects (projects with is_active=True)
                project_count = db.query(Project).filter(Project.is_active.is_(True)).count()
                active_projects.set(project_count)

                logger.debug(f"Updated metrics: {user_count} active users, {project_count} active projects")
            finally:
                db.close()
        except Exception:
            logger.error("Error updating business metrics", exc_info=True)

        # Update every 60 seconds
        await asyncio.sleep(60)


@app.on_event("startup")
async def startup_event():
    """Initialize application on startup (tolerant to missing DB in non-prod/CI)."""
    from sqlalchemy.exc import OperationalError
    from app.services.stream_processor import stream_processor
    import asyncio

    logger.info("Starting AgentGuard API...")
    logger.info(f"Environment: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")
    
    # Start stream processor background task
    asyncio.create_task(stream_processor.start())
    logger.info("Stream processor background task started")

    # Update app info metrics
    update_app_info(
        version=settings.APP_VERSION,
        environment=(
            settings.ENVIRONMENT
            if hasattr(settings, "ENVIRONMENT")
            else ("development" if settings.DEBUG else "production")
        ),
    )
    logger.info("App info metrics updated")

    db_available = False
    try:
        # Run Alembic migrations to ensure database schema is up to date
        from alembic.config import Config
        from alembic import command
        import os
        
        # Get the backend directory (parent of app directory)
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        alembic_ini_path = os.path.join(backend_dir, "alembic.ini")
        alembic_script_location = os.path.join(backend_dir, "alembic")
        
        if os.path.exists(alembic_ini_path):
            alembic_cfg = Config(alembic_ini_path)
            alembic_cfg.set_main_option("script_location", alembic_script_location)
            
            try:
                command.upgrade(alembic_cfg, "head")
                logger.info("Alembic migrations applied successfully")
            except Exception as migration_error:
                logger.error(f"Alembic migration failed: {migration_error}", exc_info=True)
                # Try to manually add missing columns if migration fails
                try:
                    from sqlalchemy import text
                    with engine.begin() as conn:
                        # Check if referral_code column exists, if not add it
                        result = conn.execute(text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name='users' AND column_name='referral_code'
                        """))
                        if not result.fetchone():
                            logger.info("Adding missing referral_code columns to users table")
                            conn.execute(text("""
                                ALTER TABLE users 
                                ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50),
                                ADD COLUMN IF NOT EXISTS referral_credits INTEGER DEFAULT 0,
                                ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id)
                            """))
                            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code ON users(referral_code)"))
                            logger.info("Successfully added referral_code columns")
                except Exception as manual_fix_error:
                    logger.error(f"Failed to manually add columns: {manual_fix_error}", exc_info=True)
                    # Final fallback: create tables if they don't exist (for development)
                    Base.metadata.create_all(bind=engine)
                    logger.info("Database tables initialized (fallback)")
        else:
            # Fallback if alembic.ini not found
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables initialized (alembic.ini not found, using create_all)")
        
        db_available = True
    except OperationalError as e:
        # Database is not reachable (e.g., in CI OpenAPI job) - degrade gracefully
        logger.warning(
            "Database not reachable on startup; skipping table initialization and migrations. "
            "App will start in degraded mode.",
            exc_info=True,
        )
    except Exception as e:
        logger.error(f"Unexpected error during startup DB initialization: {e}", exc_info=True)

    # Start background scheduler only if DB is available
    if db_available:
        from app.services.scheduler_service import scheduler_service

        scheduler_service.start()
        logger.info("Background scheduler started")

        # Start periodic metrics update task
        import asyncio

        asyncio.create_task(update_business_metrics_periodically())
        logger.info("Business metrics update task started")
    else:
        logger.warning("Skipping scheduler startup because database is unavailable.")
    
    logger.info("✅ Application startup complete - Server is ready to accept requests")


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
    return {"message": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health")
async def health():
    """Health check endpoint"""
    db_ok = check_database_health()
    cache_ok = cache_service.enabled
    return {
        "status": "healthy" if db_ok and cache_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "cache": "connected" if cache_ok else "disabled_or_unreachable",
    }


@app.get("/health/live")
async def health_live():
    """Liveness probe"""
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    """Readiness probe including dependencies"""
    db_ok = check_database_health()
    cache_ok = cache_service.enabled
    status_code = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ready" if db_ok else "not_ready",
        "database": "connected" if db_ok else "unreachable",
        "cache": "connected" if cache_ok else "disabled_or_unreachable",
    }, status_code


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    from app.core.metrics import get_metrics_response

    return get_metrics_response()
