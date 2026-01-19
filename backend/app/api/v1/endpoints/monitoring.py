"""
Monitoring endpoints for status and links
"""
from fastapi import APIRouter
from app.core.config import settings
from typing import Dict

router = APIRouter()


@router.get("/status")
async def monitoring_status() -> Dict[str, any]:
    """Get monitoring status and URLs"""
    # Determine monitoring URLs based on environment
    if settings.ENVIRONMENT == "production":
        grafana_url = getattr(settings, 'GRAFANA_URL', None)
        prometheus_url = getattr(settings, 'PROMETHEUS_URL', None)
    else:
        grafana_url = "http://localhost:3001"
        prometheus_url = "http://localhost:9090"
    
    return {
        "metrics_enabled": True,
        "environment": settings.ENVIRONMENT,
        "monitoring": {
            "grafana_url": grafana_url,
            "prometheus_url": prometheus_url,
            "metrics_endpoint": "/metrics",
            "health_endpoint": "/health"
        },
        "status": "operational"
    }
