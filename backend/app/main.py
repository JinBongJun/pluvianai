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
from app.middleware.api_hook import APIHookMiddleware
from app.middleware.gzip_middleware import GZipMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.logging_middleware import LoggingMiddleware
from app.middleware.metrics_middleware import MetricsMiddleware
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

# Metrics middleware (collect API metrics)
app.add_middleware(MetricsMiddleware)

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


async def update_business_metrics_periodically():
    """Periodically update business metrics (active users, projects)"""
    import asyncio
    from app.core.database import SessionLocal
    from app.models import User, Project
    from app.core.metrics import active_users, active_projects

    while True:
        try:
            db = SessionLocal()
            try:
                # Count active users (users with is_active=True)
                user_count = db.query(User).filter(User.is_active == True).count()
                active_users.set(user_count)

                # Count active projects (projects with is_active=True)
                project_count = db.query(Project).filter(Project.is_active == True).count()
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

    logger.info("Starting AgentGuard API...")
    logger.info(f"Environment: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")

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
        # Create database tables (for development)
        # In production, use Alembic migrations instead
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized")
        db_available = True

        # Safe migration: Add shadow_routing_config column if it doesn't exist
        # This handles the case where the column was added to the model but not migrated
        try:
            from sqlalchemy import inspect, text

            inspector = inspect(engine)
            columns = [col["name"] for col in inspector.get_columns("projects")]

            if "shadow_routing_config" not in columns:
                logger.info("Adding shadow_routing_config column to projects table...")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE projects ADD COLUMN shadow_routing_config JSONB"))
                    conn.commit()
                logger.info("Migration: shadow_routing_config column added")
        except Exception as e:
            # Column might already exist, which is fine
            if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
                logger.warning(f"Migration check failed (non-critical): {str(e)}")
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
