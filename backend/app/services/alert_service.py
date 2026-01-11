"""
Alert service for notifications.
"""
import httpx
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.alert import Alert
from app.core.config import settings
from app.core.logging_config import logger


class AlertService:
    """Service for sending alerts via various channels"""
    
    def __init__(self):
        self.slack_webhook_url = None  # Should be configured per project
        self.discord_webhook_url = None  # Should be configured per project
        self.email_enabled = bool(settings.RESEND_API_KEY)  # Enable if Resend API key is configured
    
    async def send_alert(
        self,
        alert: Alert,
        channels: Optional[List[str]] = None,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Send alert through specified channels
        
        Args:
            alert: Alert object to send
            channels: List of channels to use (slack, discord, email)
            db: Database session (required for email)
        
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
                    result = await self._send_email(alert, db)
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
    
    async def _send_email(self, alert: Alert, db: Optional[Session] = None) -> Dict[str, Any]:
        """Send alert via email"""
        if not self.email_enabled:
            return {"status": "skipped", "message": "Email not enabled"}
        
        if not db:
            return {"status": "error", "message": "Database session required"}
        
        # Get user email from project
        from app.models.project import Project
        project = db.query(Project).filter(Project.id == alert.project_id).first()
        if not project:
            return {"status": "error", "message": "Project not found"}
        
        from app.models.user import User
        user = db.query(User).filter(User.id == project.owner_id).first()
        if not user or not user.email:
            return {"status": "error", "message": "User email not found"}
        
        recipient_email = user.email
        
        # Use Resend for email delivery
        if settings.RESEND_API_KEY:
            return await self._send_email_resend(alert, recipient_email)
        else:
            return {"status": "error", "message": "Resend API key not configured. Please set RESEND_API_KEY environment variable."}
    
    async def _send_email_resend(self, alert: Alert, recipient_email: str) -> Dict[str, Any]:
        """Send email using SendGrid"""
        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail, Email, To, Content
            
            sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
            
            # Determine severity color
            severity_colors = {
                "critical": "#FF0000",
                "high": "#FF8800",
                "medium": "#FFBB00",
                "low": "#888888",
            }
            color = severity_colors.get(alert.severity, "#888888")
            
            # Create HTML email
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: {color}; border-bottom: 2px solid {color}; padding-bottom: 10px;">
                        {alert.title}
                    </h2>
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Alert Type:</strong> {alert.alert_type}</p>
                        <p><strong>Severity:</strong> {alert.severity.upper()}</p>
                        <p><strong>Project ID:</strong> {alert.project_id}</p>
                    </div>
                    <div style="margin: 20px 0;">
                        <p>{alert.message}</p>
                    </div>
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px;">
                        <p>This is an automated alert from AgentGuard.</p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            from_email = Email(settings.EMAIL_FROM or "noreply@agentguard.ai", settings.EMAIL_FROM_NAME)
            to_email = To(recipient_email)
            subject = f"[AgentGuard Alert] {alert.title}"
            content = Content("text/html", html_content)
            
            message = Mail(from_email, to_email, subject, content)
            
            # Send email (run in executor since SendGrid SDK is sync)
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: sg.send(message)
            )
            
            if response.status_code in [200, 202]:
                logger.info(f"Email sent successfully to {recipient_email} via SendGrid")
                return {"status": "sent", "channel": "email", "service": "sendgrid"}
            else:
                logger.error(f"SendGrid API error: {response.status_code}")
                return {"status": "error", "message": f"SendGrid API error: {response.status_code}"}
                
        except ImportError:
            return {"status": "error", "message": "SendGrid library not installed. Install with: pip install sendgrid"}
        except Exception as e:
            logger.error(f"Error sending email via SendGrid: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    async def _send_email_smtp(self, alert: Alert, recipient_email: str) -> Dict[str, Any]:
        """Send email using SMTP"""
        try:
            # Determine severity color
            severity_colors = {
                "critical": "#FF0000",
                "high": "#FF8800",
                "medium": "#FFBB00",
                "low": "#888888",
            }
            color = severity_colors.get(alert.severity, "#888888")
            
            # Create email message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"[AgentGuard Alert] {alert.title}"
            msg['From'] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM or 'noreply@agentguard.ai'}>"
            msg['To'] = recipient_email
            
            # Plain text version
            text_content = f"""
{alert.title}

Alert Type: {alert.alert_type}
Severity: {alert.severity.upper()}
Project ID: {alert.project_id}

{alert.message}

---
This is an automated alert from AgentGuard.
            """.strip()
            
            # HTML version
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: {color}; border-bottom: 2px solid {color}; padding-bottom: 10px;">
                        {alert.title}
                    </h2>
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Alert Type:</strong> {alert.alert_type}</p>
                        <p><strong>Severity:</strong> {alert.severity.upper()}</p>
                        <p><strong>Project ID:</strong> {alert.project_id}</p>
                    </div>
                    <div style="margin: 20px 0;">
                        <p>{alert.message}</p>
                    </div>
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px;">
                        <p>This is an automated alert from AgentGuard.</p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            part1 = MIMEText(text_content, 'plain')
            part2 = MIMEText(html_content, 'html')
            
            msg.attach(part1)
            msg.attach(part2)
            
            # Send email (run in executor since smtplib is sync)
            import asyncio
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._send_smtp_sync,
                msg,
                recipient_email
            )
            
            logger.info(f"Email sent successfully to {recipient_email} via SMTP")
            return {"status": "sent", "channel": "email", "service": "smtp"}
            
        except Exception as e:
            logger.error(f"Error sending email via SMTP: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    def _send_smtp_sync(self, msg: MIMEMultipart, recipient_email: str):
        """Synchronous SMTP send for executor"""
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
    
    async def send_batch(
        self,
        alerts: List[Alert],
        channels: Optional[List[str]] = None,
        db: Optional[Session] = None
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
                send_results = await self.send_alert(alert, channels, db)
                
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
