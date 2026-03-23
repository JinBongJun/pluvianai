"""
PluvianAI FastAPI Application
"""

import os
import sys
from contextlib import asynccontextmanager
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration
from fastapi import FastAPI, status
from fastapi import Request
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
        # Set profiles_sample_rate to 0.0 to disable profiling (reduces Sentry load)
        # Profiling generates a lot of data and can hit rate limits quickly
        profiles_sample_rate=0.0,
        # Enable sending of PII (Personally Identifiable Information)
        send_default_pii=False,
        # Set release version
        release=f"pluvianai@{settings.APP_VERSION}",
    )
    logger.info(f"Sentry initialized for environment: {settings.SENTRY_ENVIRONMENT}")
else:
    logger.info("Sentry DSN not configured, skipping Sentry initialization")
from app.core.exceptions import (
    PluvianAIException,
    pluvianai_exception_handler,
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
    BehaviorRule,
    BehaviorReport,
)

# Create database tables
# This will be moved to Alembic migrations later
# Use /api/v1/admin/init-db endpoint to initialize database after deployment
# Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup_event()
    try:
        yield
    finally:
        await shutdown_event()


docs_url = "/docs" if settings.expose_api_docs else None
redoc_url = "/redoc" if settings.expose_api_docs else None
openapi_url = "/openapi.json" if settings.expose_api_docs else None

app = FastAPI(
    title=settings.APP_NAME,
    description="LLM Agent Monitoring Platform",
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    openapi_url=openapi_url,
    docs_url=docs_url,
    redoc_url=redoc_url,
    lifespan=lifespan,
)
app.state.expose_debug_details = settings.ENVIRONMENT != "production"

# Update app info metrics
update_app_info(settings.APP_VERSION, settings.SENTRY_ENVIRONMENT)

# Add exception handlers
app.add_exception_handler(PluvianAIException, pluvianai_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

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
# Keep a coarse IP-level fallback limit high enough that dashboard polling is governed
# by bucket-specific per-user limits instead of a single low global cap.
app.add_middleware(RateLimitMiddleware, requests_per_minute=6000)

# API Hook middleware for capturing LLM API calls
app.add_middleware(APIHookMiddleware, enabled=True)

# CRITICAL: CORS middleware MUST be added LAST (last added = first executed)
# FastAPI middleware executes in REVERSE order (last added = first executed).
# By adding CORSMiddleware last, even "early return" middlewares (e.g. rate limit 429)
# still get correct CORS headers on the way back out.
#
# CORS configuration for cookie-based authentication:
# - allow_credentials=True
# - explicit allow_origins (never "*")
cors_origins = settings.cors_origins_list

# Allow localhost for development and production origins
allow_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]

# Add production origins from settings if available
if cors_origins and cors_origins != ["*"]:
    allow_origins.extend(cors_origins)

allow_credentials = True  # Required for httpOnly cookies
logger.info(f"CORS configuration: allow_origins={allow_origins}, allow_credentials={allow_credentials}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
    expose_headers=["*"],  # Expose all response headers
    max_age=3600,  # Cache preflight for 1 hour
)

logger.info("✅ CORS middleware configured successfully")

# Include API routers
app.include_router(api_router, prefix="/api/v1")

# Include API v2 router (for future breaking changes)
# v2 is currently in development - v1 remains stable
app.include_router(api_router_v2, prefix="/api/v2")

# Debug: log registered API v1 routes at startup-time (development only)
if settings.DEBUG:
    for route in app.routes:
        path = getattr(route, "path", "")
        if path.startswith("/api/v1"):
            logger.info(f"🔍 REGISTERED ROUTE: {path}")

    @app.get("/api/v1/debug/routes")
    async def list_registered_routes():
        """Return a list of all registered API v1 routes (no auth). Dev only."""
        return {
            "routes": sorted(
                {
                    getattr(route, "path", "")
                    for route in app.routes
                    if getattr(route, "path", "").startswith("/api/v1")
                }
            )
        }

# NOTE: Catch-all handler removed - it was interfering with API routing
# If needed, add specific route handlers for non-API paths instead

# Add deprecation notice middleware for v1 (when v2 alternatives exist)
# This will be enabled when specific v1 endpoints are deprecated
@app.middleware("http")
async def add_api_version_headers(request, call_next):
    """Add API version headers for versioning strategy"""
    response = await call_next(request)

    if settings.ENVIRONMENT != "production":
        # Add API version header outside production to aid local/dev migrations.
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
    #     response.headers["X-API-Migration-Guide"] = "https://docs.pluvianai.com/api/migration/v1-to-v2"
    
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

                # Count active projects (projects with is_active=True and not soft-deleted)
                project_count = (
                    db.query(Project)
                    .filter(Project.is_active.is_(True), Project.is_deleted.is_(False))
                    .count()
                )
                active_projects.set(project_count)

                logger.debug(f"Updated metrics: {user_count} active users, {project_count} active projects")
            finally:
                db.close()
        except Exception:
            logger.error("Error updating business metrics", exc_info=True)

        # Update every 60 seconds
        await asyncio.sleep(60)


async def startup_event():
    """Initialize application on startup (tolerant to missing DB in non-prod/CI)."""
    from sqlalchemy.exc import OperationalError
    from app.services.stream_processor import stream_processor
    import asyncio

    logger.info("Starting PluvianAI API...")
    logger.info(f"Environment: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")
    logger.info(f"🔐 Security: SECRET_KEY_LEN: {len(settings.SECRET_KEY)}, ALGORITHM: {settings.ALGORITHM}")
    
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
        # CRITICAL: Run migrations in background task to prevent startup hang
        # Server will start immediately even if migrations are slow
        async def run_migrations_async():
            """Run migrations asynchronously without blocking startup"""
            try:
                from alembic.config import Config
                from alembic import command
                
                # Get the backend directory (parent of app directory)
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                alembic_ini_path = os.path.join(backend_dir, "alembic.ini")
                alembic_script_location = os.path.join(backend_dir, "alembic")
                
                if os.path.exists(alembic_ini_path):
                    alembic_cfg = Config(alembic_ini_path)
                    alembic_cfg.set_main_option("script_location", alembic_script_location)
                    
                    logger.info("🔄 Starting Alembic migrations (non-blocking)...")
                    print("🔄 Starting Alembic migrations (non-blocking)...", file=sys.stderr)
                    # Run in executor to avoid blocking event loop
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, command.upgrade, alembic_cfg, "head")
                    logger.info("✅ Alembic migrations applied successfully")
                    print("✅ Alembic migrations applied successfully", file=sys.stderr)
                else:
                    # Fallback if alembic.ini not found
                    logger.warning("alembic.ini not found, using create_all fallback")
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, Base.metadata.create_all, engine)
                    logger.info("Database tables initialized (alembic.ini not found, using create_all)")
            except Exception as migration_error:
                logger.error(f"🔴 Alembic migration failed: {migration_error}", exc_info=True)
                print(f"🔴 Alembic migration failed: {migration_error}", file=sys.stderr)
                logger.warning(
                    "Schema must be updated via Alembic (alembic upgrade head). No raw DDL at startup."
                )
        
        # Start migration task but don't wait for it - server starts immediately
        # asyncio.create_task(run_migrations_async())
        logger.info("🔄 Migration task started (non-blocking) - server starting immediately")
        
        # Test DB connection to determine if DB is available
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_available = True
            logger.info("✅ Database connection verified")
        except Exception as db_test_error:
            logger.warning(f"Database connection test failed: {db_test_error}")
            db_available = False
        
    except OperationalError as e:
        # Database is not reachable (e.g., in CI OpenAPI job) - degrade gracefully
        logger.warning(
            "Database not reachable on startup; skipping table initialization and migrations. "
            "App will start in degraded mode.",
            exc_info=True,
        )
        db_available = False
    except Exception as e:
        logger.error(f"Unexpected error during startup DB initialization: {e}", exc_info=True)
        db_available = False

    # Start background scheduler only if DB is available
    if db_available:
        from app.services.scheduler_service import scheduler_service
        from app.services.release_gate_job_runner import release_gate_job_runner

        scheduler_service.start()
        logger.info("Background scheduler started")

        # Start periodic metrics update task
        import asyncio

        asyncio.create_task(update_business_metrics_periodically())
        logger.info("Business metrics update task started")

        if getattr(settings, "RELEASE_GATE_JOB_RUNNER_ENABLED", True):
            asyncio.create_task(release_gate_job_runner.start())
            logger.info("Release Gate job runner background task started")
        else:
            logger.info("Release Gate job runner disabled in web process (RELEASE_GATE_JOB_RUNNER_ENABLED=false)")
    else:
        logger.warning("Skipping scheduler startup because database is unavailable.")

    # CRITICAL: Log startup completion - this confirms server is ready
    logger.info("=" * 80)
    logger.info("✅✅✅ APPLICATION STARTUP COMPLETE - SERVER IS READY TO ACCEPT REQUESTS ✅✅✅")
    logger.info(f"✅ Server listening on port {os.environ.get('PORT', '8000')}")
    logger.info(f"✅ CORS is configured to allow all origins: {settings.cors_origins_list}")
    logger.info("=" * 80)
    
    # CRITICAL: Also print to stdout/stderr so Railway captures it
    import sys
    print("=" * 80, file=sys.stderr)
    print("✅✅✅ APPLICATION STARTUP COMPLETE - SERVER IS READY TO ACCEPT REQUESTS ✅✅✅", file=sys.stderr)
    print(f"✅ Server listening on port {os.environ.get('PORT', '8000')}", file=sys.stderr)
    print("=" * 80, file=sys.stderr)
    logger.info(f"✅ CORS is configured to allow all origins: {allow_origins}")
    logger.info("✅ Server listening and ready for connections")


async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down PluvianAI API...")

    # Shutdown background scheduler
    from app.services.scheduler_service import scheduler_service
    from app.services.release_gate_job_runner import release_gate_job_runner

    scheduler_service.shutdown()
    try:
        await release_gate_job_runner.stop()
    except Exception:
        logger.warning("Failed stopping Release Gate job runner", exc_info=True)

    # Additional cleanup tasks can be added here


@app.get("/")
async def root(request: Request):
    """Root endpoint with CORS headers"""
    origin = request.headers.get("origin", "none")
    ip = request.client.host if request.client else "unknown"
    logger.info(f"🌐 ROOT ENDPOINT: {request.method} {request.url.path} from origin: {origin}, IP: {ip}")
    response = {"message": settings.APP_NAME}
    if settings.ENVIRONMENT != "production":
        response["version"] = settings.APP_VERSION
    return response

@app.get("/health")
async def health(request: Request):
    """Health check endpoint - Railway uses this for health checks"""
    origin = request.headers.get("origin", "none")
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    # CRITICAL: Log immediately to verify Railway health checks reach the server
    logger.info(f"🏥 HEALTH CHECK: {request.method} {request.url.path} from origin: {origin}, IP: {ip}, User-Agent: {user_agent[:50]}")
    
    # Always return 200 OK for health checks - Railway needs this to route traffic
    # Database check is non-blocking for health checks
    try:
        db_ok = check_database_health()
    except Exception as e:
        logger.warning(f"Health check DB test failed: {e}")
        db_ok = False
    
    cache_ok = cache_service.enabled
    
    # CRITICAL: Always return 200 OK for Railway health checks
    # Railway will not route traffic if health check fails
    status_code = status.HTTP_200_OK
    
    response_data = {
        "status": "ready" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "cache": "connected" if cache_ok else "disabled_or_unreachable",
    }
    
    logger.info(f"🏥 HEALTH CHECK RESPONSE: {status_code}, {response_data}")
    return response_data, status_code


@app.get("/health/live")
async def health_live(request: Request):
    """Liveness probe - Railway may use this"""
    origin = request.headers.get("origin", "none")
    logger.info(f"💓 LIVENESS PROBE: {request.method} {request.url.path} from origin: {origin}, IP: {request.client.host if request.client else 'unknown'}")
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


if settings.expose_metrics_endpoint:
    @app.get("/metrics")
    async def metrics():
        """Prometheus metrics endpoint"""
        from app.core.metrics import get_metrics_response

        return get_metrics_response()
