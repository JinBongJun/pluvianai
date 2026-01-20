"""
Health check endpoints.

Note: This module is imported as part of application startup, so it must be
robust even when optional dependencies (like ``psutil``) are missing.
"""
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services.cache_service import cache_service

try:
    import psutil  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - environment-dependent
    psutil = None  # type: ignore[assignment]

router = APIRouter()


@router.get("")
def health_check(db: Session = Depends(get_db)):
    """
    Health check with DB connectivity validation.
    """
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as exc:
        db_status = "error"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available",
        ) from exc

    # Check Redis
    redis_status = "ok" if cache_service.enabled else "not_configured"

    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": db_status,
        "redis": redis_status,
    }


@router.get("/detailed")
def detailed_health_check(db: Session = Depends(get_db)):
    """
    Detailed health check with system information
    """
    health_status: Dict[str, Any] = {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "timestamp": None,
    }
    
    from datetime import datetime
    health_status["timestamp"] = datetime.utcnow().isoformat()
    
    # Database check
    try:
        db.execute(text("SELECT 1"))
        health_status["database"] = {
            "status": "ok",
            "connection": "connected",
        }
    except Exception as e:
        health_status["database"] = {
            "status": "error",
            "connection": "disconnected",
            "error": str(e),
        }
        health_status["status"] = "unhealthy"
    
    # Redis check
    try:
        if cache_service.enabled:
            cache_service.redis_client.ping()
            health_status["redis"] = {
                "status": "ok",
                "connection": "connected",
            }
        else:
            health_status["redis"] = {
                "status": "not_configured",
                "connection": "not_configured",
            }
    except Exception as e:
        health_status["redis"] = {
            "status": "error",
            "connection": "disconnected",
            "error": str(e),
        }
        if health_status["status"] == "healthy":
            health_status["status"] = "degraded"  # Redis failure is not critical
    
    # System resources (optional - depends on psutil availability)
    if psutil is not None:
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage("/")

            health_status["system"] = {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "memory_available_mb": memory.available / (1024 * 1024),
                "disk_percent": disk.percent,
                "disk_free_gb": disk.free / (1024 * 1024 * 1024),
            }

            # Warn if resources are high
            if cpu_percent > 90 or memory.percent > 90:
                health_status["status"] = "degraded"
                health_status["warnings"] = health_status.get("warnings", [])
                if cpu_percent > 90:
                    health_status["warnings"].append(f"High CPU usage: {cpu_percent}%")
                if memory.percent > 90:
                    health_status["warnings"].append(f"High memory usage: {memory.percent}%")

        except Exception as e:  # pragma: no cover - defensive logging
            # psutil might not be available, or might fail at runtime
            health_status["system"] = {
                "status": "unavailable",
                "error": str(e),
            }
    else:
        # psutil not installed in this environment – keep health endpoint working
        health_status["system"] = {
            "status": "unavailable",
            "reason": "psutil not installed",
        }
    
    # External API checks (optional)
    health_status["external_apis"] = {
        "sentry": "configured" if settings.SENTRY_DSN else "not_configured",
    }
    
    return health_status