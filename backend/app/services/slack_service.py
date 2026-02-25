"""
Slack Service for sending Slack notifications
"""

from typing import Optional, Dict, Any
from datetime import datetime
import httpx
from app.core.config import settings
from app.core.logging_config import logger
from app.services.notification_channel import NotificationChannel


class SlackService(NotificationChannel):
    """Slack service for sending notifications via webhooks"""

    def __init__(self):
        """Initialize Slack service"""
        self.webhook_url = getattr(settings, 'SLACK_WEBHOOK_URL', None)
        self.enabled = bool(self.webhook_url)

    async def send_alert(
        self,
        title: str,
        message: str,
        level: str = "medium",
        project_name: Optional[str] = None,
        dashboard_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send alert to Slack via webhook
        
        Args:
            title: Alert title
            message: Alert message
            level: Alert level (critical, high, medium, low)
            project_name: Optional project name
            dashboard_url: Optional dashboard URL
        
        Returns:
            Dict with status and result information
        """
        if not self.enabled:
            return {
                "status": "error",
                "message": "Slack webhook not configured",
                "channel": "slack",
            }

        try:
            # Color mapping for severity levels
            color_map = {
                "critical": "#ef4444",  # red
                "high": "#f59e0b",  # amber
                "medium": "#3b82f6",  # blue
                "low": "#10b981",  # green
            }
            color = color_map.get(level.lower(), "#6b7280")  # default gray

            # Build Slack message payload
            payload = {
                "text": f"PluvianAI Alert: {title}",
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": f"🚨 PluvianAI Alert",
                        }
                    },
                    {
                        "type": "section",
                        "fields": [
                            {
                                "type": "mrkdwn",
                                "text": f"*Level:* {level.upper()}"
                            },
                            {
                                "type": "mrkdwn",
                                "text": f"*Project:* {project_name or 'Unknown'}"
                            }
                        ]
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Message:*\n{message}"
                        }
                    }
                ],
                "attachments": [
                    {
                        "color": color,
                        "footer": "PluvianAI",
                        "ts": int(datetime.utcnow().timestamp())
                    }
                ]
            }

            # Add dashboard URL if provided
            if dashboard_url:
                payload["blocks"].append({
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "View in Dashboard"
                            },
                            "url": dashboard_url,
                            "style": "primary"
                        }
                    ]
                })

            # Send to Slack webhook
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json=payload,
                    timeout=5.0
                )
                response.raise_for_status()

            logger.info(
                f"Slack alert sent successfully",
                extra={
                    "title": title,
                    "level": level,
                    "service": "slack",
                }
            )

            return {
                "status": "sent",
                "channel": "slack",
            }

        except httpx.RequestError as e:
            logger.error(
                f"Failed to send Slack alert: Network error: {str(e)}",
                extra={"title": title, "level": level, "service": "slack"},
                exc_info=True,
            )
            return {
                "status": "error",
                "message": f"Network error: {str(e)}",
                "channel": "slack",
            }
        except Exception as e:
            logger.error(
                f"Failed to send Slack alert: {str(e)}",
                extra={"title": title, "level": level, "service": "slack"},
                exc_info=True,
            )
            return {
                "status": "error",
                "message": f"Failed to send alert: {str(e)}",
                "channel": "slack",
            }
