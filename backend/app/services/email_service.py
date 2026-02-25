"""
Email Service using Resend
"""

from typing import Optional, Dict, Any
from app.core.config import settings
from app.core.logging_config import logger
from app.services.notification_channel import NotificationChannel


class EmailService(NotificationChannel):
    """Email service using Resend for sending emails"""

    def __init__(self):
        """Initialize email service with Resend configuration"""
        self.from_email = settings.EMAIL_FROM or "onboarding@resend.dev"
        self.from_name = settings.EMAIL_FROM_NAME or "PluvianAI"
        self.api_key = settings.RESEND_API_KEY
        self.enabled = bool(self.api_key)

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
        Send alert via email (implements NotificationChannel interface)
        
        Args:
            title: Alert title
            message: Alert message
            level: Alert level (critical, high, medium, low)
            project_name: Optional project name
            dashboard_url: Optional dashboard URL
            **kwargs: Additional parameters (to: email address)
        
        Returns:
            Dict with status and result information
        """
        to = kwargs.get("to")
        if not to:
            return {
                "status": "error",
                "message": "Email address (to) is required",
                "channel": "email",
            }
        
        # Render HTML content
        html_content = self._render_alert_email_html(
            level=level,
            project_name=project_name or "Unknown Project",
            message=message,
            title=title,
            timestamp=kwargs.get("timestamp", ""),
            dashboard_url=dashboard_url,
        )
        
        return await self.send_alert_email(
            to=to,
            subject=f"PluvianAI Alert: {title}",
            html_content=html_content,
        )
    
    async def send_alert_email(
        self,
        to: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send alert email via Resend

        Args:
            to: Recipient email address
            subject: Email subject
            html_content: HTML email content
            text_content: Optional plain text content

        Returns:
            Dict with status and result/error information
        """
        if not self.enabled:
            return {
                "status": "error",
                "message": "Resend API key not configured",
                "channel": "email",
            }

        try:
            # Import resend dynamically to avoid import errors if not installed
            try:
                import resend
            except ImportError:
                return {
                    "status": "error",
                    "message": "Resend library not installed",
                    "channel": "email",
                }

            # Set API key
            resend.api_key = self.api_key

            # Prepare email parameters
            params = {
                "from": f"{self.from_name} <{self.from_email}>",
                "to": [to],
                "subject": subject,
                "html": html_content,
            }

            # Add text content if provided
            if text_content:
                params["text"] = text_content

            # Send email
            email = resend.Emails.send(params)

            logger.info(
                f"Email sent successfully via Resend",
                extra={
                    "to": to,
                    "subject": subject,
                    "email_id": email.get("id"),
                    "service": "resend",
                },
            )

            return {
                "status": "sent",
                "id": email.get("id"),
                "email_id": email.get("id"),  # Alias for test compatibility
                "channel": "email",
            }

        except Exception as e:
            logger.error(
                f"Failed to send email via Resend: {str(e)}",
                extra={"to": to, "subject": subject, "service": "resend"},
                exc_info=True,
            )
            return {
                "status": "error",
                "message": f"Failed to send email: {str(e)}",
                "channel": "email",
            }

    def _render_alert_email_html(
        self,
        level: str,
        project_name: str,
        message: str,
        title: str,
        timestamp: str,
        dashboard_url: Optional[str] = None,
    ) -> str:
        """
        Render alert email HTML template

        Args:
            level: Alert severity level (critical, high, medium, low)
            project_name: Project name
            message: Alert message
            title: Alert title
            timestamp: Alert timestamp
            dashboard_url: Optional dashboard URL

        Returns:
            HTML email content
        """
        # Color mapping for severity levels
        color_map = {
            "critical": "#ef4444",  # red
            "high": "#f59e0b",  # amber
            "medium": "#3b82f6",  # blue
            "low": "#10b981",  # green
        }
        border_color = color_map.get(level.lower(), "#6b7280")  # default gray

        dashboard_link = ""
        if dashboard_url:
            dashboard_link = f'<p><a href="{dashboard_url}" style="color: {border_color}; text-decoration: none; font-weight: bold;">View in Dashboard →</a></p>'

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background-color: #f9fafb;
            margin: 0;
            padding: 20px;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }}
        .header {{
            background-color: {border_color};
            color: #ffffff;
            padding: 20px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }}
        .content {{
            padding: 30px;
        }}
        .alert-box {{
            border-left: 4px solid {border_color};
            background-color: #fef2f2;
            padding: 16px;
            margin: 20px 0;
            border-radius: 4px;
        }}
        .alert-box.level-high {{
            background-color: #fffbeb;
        }}
        .alert-box.level-medium {{
            background-color: #eff6ff;
        }}
        .alert-box.level-low {{
            background-color: #f0fdf4;
        }}
        .info-row {{
            margin: 12px 0;
        }}
        .info-label {{
            font-weight: 600;
            color: #4b5563;
            display: inline-block;
            min-width: 100px;
        }}
        .info-value {{
            color: #1f2937;
        }}
        .footer {{
            background-color: #f9fafb;
            padding: 20px;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }}
        a {{
            color: {border_color};
            text-decoration: none;
        }}
        a:hover {{
            text-decoration: underline;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 PluvianAI Alert</h1>
        </div>
        <div class="content">
            <div class="alert-box level-{level.lower()}">
                <div class="info-row">
                    <span class="info-label">Level:</span>
                    <span class="info-value">{level.upper()}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Title:</span>
                    <span class="info-value">{title}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Project:</span>
                    <span class="info-value">{project_name}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Time:</span>
                    <span class="info-value">{timestamp}</span>
                </div>
            </div>
            <div style="margin: 20px 0;">
                <p style="margin: 0 0 10px 0; font-weight: 600; color: #1f2937;">Message:</p>
                <p style="margin: 0; color: #4b5563; white-space: pre-wrap;">{message}</p>
            </div>
            {dashboard_link}
        </div>
        <div class="footer">
            <p style="margin: 0;">This is an automated alert from PluvianAI.</p>
            <p style="margin: 5px 0 0 0;">You're receiving this because you're subscribed to alerts for this project.</p>
        </div>
    </div>
</body>
</html>
"""
        return html
