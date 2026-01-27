"""
Discord Service for sending Discord notifications
"""

from typing import Optional, Dict, Any
from datetime import datetime
import httpx
from app.core.config import settings
from app.core.logging_config import logger
from app.services.notification_channel import NotificationChannel


class DiscordService(NotificationChannel):
    """Discord service for sending notifications via webhooks"""

    def __init__(self):
        """Initialize Discord service"""
        # Discord webhook URL is per-project, not global
        # This service just provides the sending functionality
        self.enabled = True  # Service is always enabled, webhook URL determines if it works

    async def send_alert(
        self,
        title: str,
        message: str,
        level: str = "medium",
        project_name: Optional[str] = None,
        dashboard_url: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Send alert to Discord via webhook (implements NotificationChannel interface)
        
        Args:
            title: Alert title
            message: Alert message
            level: Alert level (critical, high, medium, low)
            project_name: Optional project name
            dashboard_url: Optional dashboard URL
            **kwargs: Additional parameters (webhook_url: Discord webhook URL)
        
        Returns:
            Dict with status and result information
        """
        webhook_url = kwargs.get("webhook_url")
        if not webhook_url:
            return {
                "status": "error",
                "message": "Discord webhook URL not configured",
                "channel": "discord",
            }

        try:
            # Color mapping for severity levels (Discord embed colors)
            color_map = {
                "critical": 15158332,  # red
                "high": 16776960,  # yellow
                "medium": 3447003,  # blue
                "low": 3066993,  # green
            }
            color = color_map.get(level.lower(), 9807270)  # default gray

            # Build Discord embed payload
            embed = {
                "title": f"🚨 AgentGuard Alert: {title}",
                "description": message,
                "color": color,
                "fields": [
                    {
                        "name": "Level",
                        "value": level.upper(),
                        "inline": True
                    },
                    {
                        "name": "Project",
                        "value": project_name or "Unknown",
                        "inline": True
                    }
                ],
                "timestamp": datetime.utcnow().isoformat(),
                "footer": {
                    "text": "AgentGuard"
                }
            }

            # Add dashboard URL if provided
            if dashboard_url:
                embed["url"] = dashboard_url

            # Build Discord webhook payload
            payload = {
                "embeds": [embed]
            }

            # Send to Discord webhook
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    webhook_url,
                    json=payload,
                    timeout=5.0
                )
                response.raise_for_status()

            logger.info(
                f"Discord alert sent successfully",
                extra={
                    "title": title,
                    "level": level,
                    "service": "discord",
                }
            )

            return {
                "status": "sent",
                "channel": "discord",
            }

        except httpx.RequestError as e:
            logger.error(
                f"Failed to send Discord alert: Network error: {str(e)}",
                extra={"title": title, "level": level, "service": "discord"},
                exc_info=True,
            )
            return {
                "status": "error",
                "message": f"Network error: {str(e)}",
                "channel": "discord",
            }
        except Exception as e:
            logger.error(
                f"Failed to send Discord alert: {str(e)}",
                extra={"title": title, "level": level, "service": "discord"},
                exc_info=True,
            )
            return {
                "status": "error",
                "message": f"Failed to send alert: {str(e)}",
                "channel": "discord",
            }
