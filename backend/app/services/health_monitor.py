"""
Health Monitor Service for automatic health checks and alerts
"""

from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import SessionLocal
from app.services.alert_service import AlertService
from app.infrastructure.repositories.alert_repository import AlertRepository
from app.core.logging_config import logger
from app.core.config import settings
import httpx


class HealthMonitor:
    """Service for monitoring system health and sending alerts"""

    def __init__(self):
        # AlertService will be created with DB session when needed
        # Use API_URL from settings if available, otherwise default to localhost
        self.base_url = getattr(settings, "API_URL", None) or "http://localhost:8000"

    def _get_alert_service(self, db: Session) -> AlertService:
        """Get AlertService instance with DB session"""
        alert_repo = AlertRepository(db)
        return AlertService(alert_repo, db)

    async def check_system_health(self, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        Check system health and return status

        Args:
            db: Database session (optional, will create if not provided)

        Returns:
            Dictionary with health status
        """
        if not db:
            db = SessionLocal()
            should_close = True
        else:
            should_close = False

        try:
            # Check health endpoint
            health_data = None
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(f"{self.base_url}/api/v1/health/detailed", timeout=5.0)
                    health_data = response.json() if response.status_code == 200 else None
            except Exception as e:
                logger.error(f"Error checking health endpoint: {str(e)}")
                health_data = {
                    "status": "error",
                    "error": str(e),
                }
            
            # Also check Redis directly as fallback
            try:
                from app.services.cache_service import cache_service
                if cache_service.enabled:
                    cache_service.redis_client.ping()
                else:
                    # Redis not configured - not an error, just not available
                    if health_data and health_data.get("redis", {}).get("status") != "not_configured":
                        health_data.setdefault("redis", {})["status"] = "not_configured"
            except Exception as redis_error:
                logger.error(f"Direct Redis check failed: {str(redis_error)}")
                if health_data:
                    health_data.setdefault("redis", {})["status"] = "error"
                    health_data.setdefault("redis", {})["error"] = str(redis_error)

            # Determine if alert should be sent
            should_alert = False
            alert_severity = "medium"
            alert_message = ""

            if health_data:
                if health_data.get("status") == "unhealthy":
                    should_alert = True
                    alert_severity = "critical"
                    alert_message = "System is unhealthy"
                elif health_data.get("status") == "degraded":
                    should_alert = True
                    alert_severity = "medium"
                    alert_message = "System is degraded"

                # Check database
                if health_data.get("database", {}).get("status") == "error":
                    should_alert = True
                    alert_severity = "critical"
                    alert_message = "Database connection failed"
                
                # Check Redis
                if health_data.get("redis", {}).get("status") == "error":
                    should_alert = True
                    alert_severity = "critical"
                    alert_message = "Redis connection failed"

            return {
                "health_data": health_data,
                "should_alert": should_alert,
                "alert_severity": alert_severity,
                "alert_message": alert_message,
                "checked_at": datetime.utcnow().isoformat(),
            }
        finally:
            if should_close:
                db.close()

    async def send_health_alert(
        self, health_result: Dict[str, Any], project_id: Optional[int] = None, db: Optional[Session] = None
    ) -> None:
        """
        Send health alert if needed

        Args:
            health_result: Result from check_system_health
            project_id: Optional project ID (for project-specific alerts)
            db: Database session (optional, will create if not provided)
        """
        if not health_result.get("should_alert"):
            return

        if not db:
            db = SessionLocal()
            should_close = True
        else:
            should_close = False

        try:
            # Only send critical alerts (to avoid spam)
            if health_result.get("alert_severity") == "critical":
                from app.models.alert import Alert

                # Find a project to associate the alert with, or use admin project
                from app.models.project import Project

                if project_id:
                    project = db.query(Project).filter(Project.id == project_id).first()
                else:
                    # Use first active project as fallback
                    project = db.query(Project).filter(Project.is_active.is_(True)).first()

                if project:
                    alert = Alert(
                        project_id=project.id,
                        alert_type="system_health",
                        severity=health_result.get("alert_severity", "critical"),
                        title="System Health Alert",
                        message=health_result.get("alert_message", "System health check failed"),
                        alert_data={
                            "health_status": health_result.get("health_data", {}),
                            "checked_at": health_result.get("checked_at"),
                        },
                        notification_channels=["email"],  # Only email for critical alerts
                    )
                    db.add(alert)
                    db.commit()

                    # Send alert
                    alert_service = self._get_alert_service(db)
                    await alert_service.send_alert(alert, ["email"], db=db)
                    logger.warning(f"Health alert sent: {health_result.get('alert_message')}")
        finally:
            if should_close:
                db.close()

    async def monitor_health_and_alert(
        self, project_id: Optional[int] = None, db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Check health and send alert if needed (convenience method)

        Args:
            project_id: Optional project ID
            db: Database session (optional)

        Returns:
            Health check result
        """
        health_result = await self.check_system_health(db)
        await self.send_health_alert(health_result, project_id, db)
        return health_result


# Global instance
health_monitor = HealthMonitor()
