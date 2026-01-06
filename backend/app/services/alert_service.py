"""
Alert service for notifications.
"""
import httpx
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.alert import Alert
from app.core.config import settings


class AlertService:
    """Service for sending alerts via various channels"""
    
    def __init__(self):
        self.slack_webhook_url = None  # Should be configured per project
        self.discord_webhook_url = None  # Should be configured per project
        self.email_enabled = False  # Email service to be implemented
    
    async def send_alert(
        self,
        alert: Alert,
        channels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Send alert through specified channels
        
        Args:
            alert: Alert object to send
            channels: List of channels to use (slack, discord, email)
        
        Returns:
            Dictionary with send status for each channel
        """
        if channels is None:
            channels = alert.notification_channels or ["email"]
        
        results = {}
        
        for channel in channels:
            try:
                if channel == "slack":
                    result = await self._send_slack(alert)
                elif channel == "discord":
                    result = await self._send_discord(alert)
                elif channel == "email":
                    result = await self._send_email(alert)
                else:
                    result = {"status": "error", "message": f"Unknown channel: {channel}"}
                
                results[channel] = result
            except Exception as e:
                results[channel] = {"status": "error", "message": str(e)}
        
        return results
    
    async def _send_slack(self, alert: Alert) -> Dict[str, Any]:
        """Send alert to Slack via webhook"""
        # In production, webhook URL should be stored per project
        webhook_url = self.slack_webhook_url
        
        if not webhook_url:
            return {"status": "skipped", "message": "Slack webhook not configured"}
        
        # Determine color based on severity
        color_map = {
            "critical": "#ff0000",
            "high": "#ff8800",
            "medium": "#ffbb00",
            "low": "#888888",
        }
        color = color_map.get(alert.severity, "#888888")
        
        payload = {
            "attachments": [
                {
                    "color": color,
                    "title": alert.title,
                    "text": alert.message,
                    "fields": [
                        {
                            "title": "Alert Type",
                            "value": alert.alert_type,
                            "short": True,
                        },
                        {
                            "title": "Severity",
                            "value": alert.severity,
                            "short": True,
                        },
                    ],
                    "ts": int(alert.created_at.timestamp()),
                }
            ]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
        
        return {"status": "sent", "channel": "slack"}
    
    async def _send_discord(self, alert: Alert) -> Dict[str, Any]:
        """Send alert to Discord via webhook"""
        webhook_url = self.discord_webhook_url
        
        if not webhook_url:
            return {"status": "skipped", "message": "Discord webhook not configured"}
        
        # Determine color based on severity (Discord uses integer colors)
        color_map = {
            "critical": 0xFF0000,  # Red
            "high": 0xFF8800,  # Orange
            "medium": 0xFFBB00,  # Yellow
            "low": 0x888888,  # Gray
        }
        color = color_map.get(alert.severity, 0x888888)
        
        payload = {
            "embeds": [
                {
                    "title": alert.title,
                    "description": alert.message,
                    "color": color,
                    "fields": [
                        {
                            "name": "Alert Type",
                            "value": alert.alert_type,
                            "inline": True,
                        },
                        {
                            "name": "Severity",
                            "value": alert.severity,
                            "inline": True,
                        },
                    ],
                    "timestamp": alert.created_at.isoformat(),
                }
            ]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
        
        return {"status": "sent", "channel": "discord"}
    
    async def _send_email(self, alert: Alert) -> Dict[str, Any]:
        """Send alert via email"""
        # Email service implementation would go here
        # For MVP, we'll just log it
        if not self.email_enabled:
            return {"status": "skipped", "message": "Email not enabled"}
        
        # TODO: Implement email sending
        # This would typically use a service like SendGrid, AWS SES, etc.
        return {"status": "not_implemented", "message": "Email sending not yet implemented"}
    
    async def send_batch(
        self,
        alerts: List[Alert],
        channels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Send multiple alerts in batch
        
        Returns:
            Summary of send results
        """
        results = {
            "total": len(alerts),
            "sent": 0,
            "failed": 0,
            "skipped": 0,
            "details": [],
        }
        
        for alert in alerts:
            try:
                send_results = await self.send_alert(alert, channels)
                
                # Check if at least one channel succeeded
                any_sent = any(
                    r.get("status") == "sent" for r in send_results.values()
                )
                
                if any_sent:
                    results["sent"] += 1
                    alert.is_sent = True
                    from datetime import datetime
                    alert.sent_at = datetime.utcnow()
                else:
                    results["skipped"] += 1
                
                results["details"].append({
                    "alert_id": alert.id,
                    "results": send_results,
                })
            except Exception as e:
                results["failed"] += 1
                results["details"].append({
                    "alert_id": alert.id,
                    "error": str(e),
                })
        
        return results
    
    def configure_webhooks(
        self,
        slack_webhook_url: Optional[str] = None,
        discord_webhook_url: Optional[str] = None
    ):
        """Configure webhook URLs"""
        if slack_webhook_url:
            self.slack_webhook_url = slack_webhook_url
        if discord_webhook_url:
            self.discord_webhook_url = discord_webhook_url
