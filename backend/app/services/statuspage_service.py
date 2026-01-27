"""
StatusPage.io integration service
Syncs system health status to external status page
"""

import os
import httpx
from typing import Dict, Any, Optional
from app.core.config import settings
from app.core.logging_config import logger

# StatusPage.io API endpoint
STATUSPAGE_API_URL = "https://api.statuspage.io/v1"


class StatusPageService:
    """Service for syncing health status to StatusPage.io"""

    def __init__(self):
        self.page_id = os.getenv("STATUSPAGE_PAGE_ID")
        self.api_key = os.getenv("STATUSPAGE_API_KEY")
        self.enabled = bool(self.page_id and self.api_key)

    async def update_component_status(
        self,
        component_id: str,
        status: str,  # operational, degraded_performance, partial_outage, major_outage
        description: Optional[str] = None,
    ) -> bool:
        """
        Update component status on StatusPage
        
        Args:
            component_id: StatusPage component ID
            status: Component status
            description: Optional status description
            
        Returns:
            True if update was successful, False otherwise
        """
        if not self.enabled:
            return False

        try:
            url = f"{STATUSPAGE_API_URL}/pages/{self.page_id}/components/{component_id}.json"
            headers = {
                "Authorization": f"OAuth {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "component": {
                    "status": status,
                }
            }
            if description:
                payload["component"]["description"] = description

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.patch(url, json=payload, headers=headers)
                response.raise_for_status()
                return True

        except Exception as e:
            logger.warning(f"Failed to update StatusPage component: {str(e)}")
            return False

    async def create_incident(
        self,
        name: str,
        status: str,  # investigating, identified, monitoring, resolved
        impact: str,  # minor, major, critical
        components: Optional[list] = None,
        body: Optional[str] = None,
    ) -> Optional[str]:
        """
        Create an incident on StatusPage
        
        Args:
            name: Incident name
            status: Incident status
            impact: Impact level
            components: List of component IDs affected
            body: Incident description
            
        Returns:
            Incident ID if created successfully, None otherwise
        """
        if not self.enabled:
            return None

        try:
            url = f"{STATUSPAGE_API_URL}/pages/{self.page_id}/incidents.json"
            headers = {
                "Authorization": f"OAuth {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "incident": {
                    "name": name,
                    "status": status,
                    "impact": impact,
                    "body": body or name,
                }
            }
            if components:
                payload["incident"]["component_ids"] = components

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                return data.get("id")

        except Exception as e:
            logger.warning(f"Failed to create StatusPage incident: {str(e)}")
            return None

    async def sync_health_status(self, health_data: Dict[str, Any]) -> bool:
        """
        Sync health check results to StatusPage components
        
        Args:
            health_data: Health check data from /health endpoint
            
        Returns:
            True if sync was successful, False otherwise
        """
        if not self.enabled:
            return False

        # Map health status to StatusPage component statuses
        status_mapping = {
            "ok": "operational",
            "connected": "operational",
            "error": "major_outage",
            "disconnected": "major_outage",
            "degraded": "degraded_performance",
        }

        # Update database component
        db_status = health_data.get("database", {}).get("connection", "unknown")
        db_statuspage_status = status_mapping.get(db_status, "operational")
        await self.update_component_status(
            component_id=os.getenv("STATUSPAGE_COMPONENT_DB", "db"),
            status=db_statuspage_status,
            description=f"Database: {db_status}",
        )

        # Update Redis component
        redis_status = health_data.get("redis", {}).get("connection", "unknown")
        redis_statuspage_status = status_mapping.get(redis_status, "operational")
        await self.update_component_status(
            component_id=os.getenv("STATUSPAGE_COMPONENT_REDIS", "redis"),
            status=redis_statuspage_status,
            description=f"Redis: {redis_status}",
        )

        # Update API component
        api_status = health_data.get("status", "healthy")
        api_statuspage_status = "operational" if api_status == "healthy" else "degraded_performance"
        await self.update_component_status(
            component_id=os.getenv("STATUSPAGE_COMPONENT_API", "api"),
            status=api_statuspage_status,
            description=f"API: {api_status}",
        )

        return True


# Global instance
statuspage_service = StatusPageService()
