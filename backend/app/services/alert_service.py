from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
from app.models.alert import Alert
from app.models.project import Project
from app.models.user import User
from app.infrastructure.repositories.alert_repository import AlertRepository
from app.core.logging_config import logger
from app.services.email_service import EmailService
from app.services.slack_service import SlackService
from app.services.discord_service import DiscordService


class AlertService:
    """Service for alert management business logic"""

    def __init__(
        self,
        alert_repo: AlertRepository,
        db: Session
    ):
        self.alert_repo = alert_repo
        self.db = db
        # Initialize notification channels (with error handling)
        try:
            self.email_service = EmailService()
        except Exception as e:
            logger.warning(f"Failed to initialize EmailService (non-critical): {str(e)}")
            self.email_service = None
        try:
            self.slack_service = SlackService()
        except Exception as e:
            logger.warning(f"Failed to initialize SlackService (non-critical): {str(e)}")
            self.slack_service = None
        try:
            self.discord_service = DiscordService()
        except Exception as e:
            logger.warning(f"Failed to initialize DiscordService (non-critical): {str(e)}")
            self.discord_service = None

    @property
    def email_enabled(self) -> bool:
        """Check if email notifications are enabled"""
        return self.email_service.enabled if self.email_service else False

    @email_enabled.setter
    def email_enabled(self, value: bool):
        """Set email enabled status (for testing)"""
        if self.email_service:
            self.email_service.enabled = value

    def get_alert_by_id(self, alert_id: int) -> Optional[Alert]:
        """Get alert by ID"""
        return self.alert_repo.find_by_id(alert_id)

    def get_alerts_by_project_id(
        self,
        project_id: int,
        limit: int = 100,
        offset: int = 0,
        alert_type: Optional[str] = None,
        severity: Optional[str] = None,
        is_resolved: Optional[bool] = None
    ) -> List[Alert]:
        """
        Get alerts for a project with optional filters
        
        Args:
            project_id: Project ID
            limit: Maximum number of results
            offset: Offset for pagination
            alert_type: Optional alert type filter
            severity: Optional severity filter
            is_resolved: Optional resolved status filter
        
        Returns:
            List of Alert entities
        """
        # Use repository's base query and filter
        query = self.db.query(Alert).filter(Alert.project_id == project_id)
        
        if alert_type:
            query = query.filter(Alert.alert_type == alert_type)
        if severity:
            query = query.filter(Alert.severity == severity)
        if is_resolved is not None:
            query = query.filter(Alert.is_resolved == is_resolved)
        
        return query.order_by(Alert.created_at.desc()).offset(offset).limit(limit).all()

    def resolve_alert(self, alert_id: int, resolved_by: int) -> Optional[Alert]:
        """
        Resolve an alert
        
        Args:
            alert_id: Alert ID
            resolved_by: User ID who resolved the alert
        
        Returns:
            Updated Alert entity or None if not found
        """
        from datetime import datetime
        alert = self.alert_repo.find_by_id(alert_id)
        if not alert:
            return None
        
        alert.is_resolved = True
        alert.resolved_by = resolved_by
        alert.resolved_at = datetime.utcnow()
        # Transaction is managed by get_db() dependency
        return self.alert_repo.save(alert)

    def unresolve_alert(self, alert_id: int) -> Optional[Alert]:
        """
        Unresolve an alert
        
        Args:
            alert_id: Alert ID
        
        Returns:
            Updated Alert entity or None if not found
        """
        alert = self.alert_repo.find_by_id(alert_id)
        if not alert:
            return None
        
        alert.is_resolved = False
        alert.resolved_by = None
        # Transaction is managed by get_db() dependency
        return self.alert_repo.save(alert)

    async def _send_email(
        self,
        alert: Alert,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Send email alert to project owner
        
        Args:
            alert: Alert entity
            db: Database session (optional, uses self.db if not provided)
        
        Returns:
            Dict with status and result information
        """
        if not db:
            return {
                "status": "error",
                "message": "Database session required",
                "channel": "email",
            }

        # Get project to find owner
        project = db.query(Project).filter(Project.id == alert.project_id).first()
        if not project:
            return {
                "status": "error",
                "message": "Project not found",
                "channel": "email",
            }

        # Get project owner
        user = db.query(User).filter(User.id == project.owner_id).first()
        if not user or not user.email:
            return {
                "status": "error",
                "message": "User not found or email not set",
                "channel": "email",
            }

        # Check if email is enabled
        if not self.email_enabled:
            return {
                "status": "error",
                "message": "Email notifications are disabled",
                "channel": "email",
            }

        # Send email using Resend
        return await self._send_email_resend(alert, user.email, project.name)

    async def _send_email_resend(
        self,
        alert: Alert,
        user_email: str,
        project_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send email alert via Resend
        
        Args:
            alert: Alert entity
            user_email: Recipient email address
            project_name: Optional project name (will query if not provided)
        
        Returns:
            Dict with status and result information
        """
        # Get project name if not provided
        if not project_name:
            project = self.db.query(Project).filter(Project.id == alert.project_id).first()
            project_name = project.name if project else "Unknown Project"

        # Format timestamp
        timestamp = alert.created_at.strftime("%Y-%m-%d %H:%M:%S UTC") if alert.created_at else "Unknown"

        # Build dashboard URL
        dashboard_url = None
        if alert.project_id:
            # In production, this would be the actual dashboard URL
            dashboard_url = f"https://app.pluvianai.com/projects/{alert.project_id}/alerts/{alert.id}"

        # Render HTML email
        if not self.email_service:
            return {"status": "skipped", "reason": "Email service not available"}
        html_content = self.email_service._render_alert_email_html(
            level=alert.severity,
            project_name=project_name,
            message=alert.message,
            title=alert.title,
            timestamp=timestamp,
            dashboard_url=dashboard_url,
        )

        # Send email
        subject = f"PluvianAI Alert: {alert.title}"
        result = await self.email_service.send_alert_email(
            to=user_email,
            subject=subject,
            html_content=html_content,
        )

        return result

    async def send_alert(
        self,
        alert: Alert,
        channels: List[str],
        db: Optional[Session] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        Send alert through multiple notification channels
        
        Args:
            alert: Alert entity
            channels: List of channel names (e.g., ["email", "slack"])
            db: Database session (optional, uses self.db if not provided)
        
        Returns:
            Dict mapping channel names to their send results
        """
        if not db:
            db = self.db

        results = {}

        # Get project and user info for all channels
        project = self.db.query(Project).filter(Project.id == alert.project_id).first()
        project_name = project.name if project else "Unknown Project"
        dashboard_url = f"https://app.pluvianai.com/projects/{alert.project_id}/alerts/{alert.id}" if alert.project_id else None
        
        # Get user email for email channel
        user_email = None
        if "email" in channels:
            user = self.db.query(User).filter(User.id == project.owner_id).first() if project else None
            user_email = user.email if user else None
        
        # Get Discord webhook URL for Discord channel
        discord_webhook_url = None
        if "discord" in channels:
            from app.models.project_notification_settings import ProjectNotificationSettings
            settings = (
                self.db.query(ProjectNotificationSettings)
                .filter(ProjectNotificationSettings.project_id == alert.project_id)
                .first()
            )
            discord_webhook_url = settings.discord_webhook_url if settings else None
        
        # Channel mapping (only include available services)
        channel_services = {}
        if "email" in channels and self.email_service:
            channel_services["email"] = (self.email_service, {"to": user_email})
        if "slack" in channels and self.slack_service:
            channel_services["slack"] = (self.slack_service, {})
        if "discord" in channels and self.discord_service:
            channel_services["discord"] = (self.discord_service, {"webhook_url": discord_webhook_url})
        
        # Send to each channel using unified interface
        for channel in channels:
            try:
                if channel not in channel_services:
                    results[channel] = {
                        "status": "error",
                        "message": f"Channel {channel} not available or not configured",
                        "channel": channel,
                    }
                    continue
                
                service, kwargs = channel_services[channel]
                
                if not service:
                    results[channel] = {
                        "status": "error",
                        "message": f"Service for {channel} not available",
                        "channel": channel,
                    }
                    continue
                
                # Check if channel is enabled
                if not service.enabled:
                    results[channel] = {
                        "status": "error",
                        "message": f"{channel} channel not enabled",
                        "channel": channel,
                    }
                    continue
                
                # Send alert using unified interface
                result = await service.send_alert(
                    title=alert.title,
                    message=alert.message,
                    level=alert.severity,
                    project_name=project_name,
                    dashboard_url=dashboard_url,
                    timestamp=alert.created_at.strftime("%Y-%m-%d %H:%M:%S UTC") if alert.created_at else "Unknown",
                    **kwargs
                )
                results[channel] = result
                
            except Exception as e:
                logger.error(
                    f"Error sending alert to {channel}: {str(e)}",
                    extra={"alert_id": alert.id, "channel": channel},
                    exc_info=True,
                )
                results[channel] = {
                    "status": "error",
                    "message": f"Error: {str(e)}",
                    "channel": channel,
                }

        return results

    def _get_notification_settings(
        self,
        project_id: int,
        user_id: int,
        db: Optional[Session] = None
    ) -> Optional[Any]:
        """
        Get notification settings for a project and user
        
        Args:
            project_id: Project ID
            user_id: User ID
            db: Database session (optional, uses self.db if not provided)
        
        Returns:
            ProjectNotificationSettings entity or None
        """
        if not db:
            db = self.db

        from app.models.project_notification_settings import ProjectNotificationSettings

        settings = (
            db.query(ProjectNotificationSettings)
            .filter(
                ProjectNotificationSettings.project_id == project_id,
                ProjectNotificationSettings.user_id == user_id
            )
            .first()
        )

        return settings

    def _should_send_alert(
        self,
        settings: Any,
        alert: Alert,
        db: Optional[Session] = None
    ) -> bool:
        """
        Check if alert should be sent based on settings
        
        Args:
            settings: ProjectNotificationSettings entity
            alert: Alert entity
            db: Database session (optional, uses self.db if not provided)
        
        Returns:
            True if alert should be sent, False otherwise
        """
        if not settings:
            # No settings configured, use defaults (send all)
            return True

        if not db:
            db = self.db

        # Check alert type
        if alert.alert_type not in settings.alert_types:
            return False

        # Check severity threshold
        severity_levels = {"low": 1, "medium": 2, "high": 3, "critical": 4}
        alert_severity_level = severity_levels.get(alert.severity, 0)
        threshold_level = severity_levels.get(settings.severity_threshold, 0)
        
        if alert_severity_level < threshold_level:
            return False

        # Check minimum interval (prevent spam)
        if settings.min_interval_minutes > 0:
            from datetime import timedelta
            cutoff_time = datetime.utcnow() - timedelta(minutes=settings.min_interval_minutes)
            
            recent_alert = (
                db.query(Alert)
                .filter(
                    Alert.project_id == alert.project_id,
                    Alert.created_at >= cutoff_time,
                    Alert.is_sent == True
                )
                .first()
            )
            
            if recent_alert:
                return False

        return True

    async def check_and_trigger_alerts(
        self,
        project_id: int,
        event_type: str,
        data: Dict[str, Any],
        db: Optional[Session] = None
    ) -> Optional[Alert]:
        """
        Check conditions and automatically trigger alerts
        
        Args:
            project_id: Project ID
            event_type: Type of event (quality_drop, error_rate_spike, drift_detection, cost_spike)
            data: Event data containing relevant metrics
            db: Database session (optional, uses self.db if not provided)
        
        Returns:
            Created Alert entity or None if no alert was triggered
        """
        if not db:
            db = self.db

        # Get project owner
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        # Get notification settings for project owner
        settings = self._get_notification_settings(project_id, project.owner_id, db)

        # Determine if alert should be created based on event type and data
        should_alert = False
        alert_type = event_type
        severity = "medium"
        title = ""
        message = ""

        if event_type == "quality_drop":
            current_score = data.get("quality_score")
            threshold = settings.quality_score_threshold if settings else None
            
            if threshold and current_score is not None and current_score < threshold:
                should_alert = True
                severity = "high" if current_score < threshold * 0.8 else "medium"
                title = f"Quality Score Dropped Below Threshold"
                message = f"Quality score ({current_score:.1f}) has dropped below the threshold ({threshold:.1f})"

        elif event_type == "error_rate_spike":
            error_rate = data.get("error_rate")
            threshold = settings.error_rate_threshold if settings else None
            
            if threshold and error_rate is not None and error_rate > threshold:
                should_alert = True
                severity = "critical" if error_rate > threshold * 2 else "high"
                title = f"Error Rate Exceeded Threshold"
                message = f"Error rate ({error_rate:.2f}%) has exceeded the threshold ({threshold:.2f}%)"

        elif event_type == "drift_detection":
            drift_score = data.get("drift_score")
            threshold = settings.drift_threshold if settings else None
            
            if threshold and drift_score is not None and drift_score > threshold:
                should_alert = True
                severity = data.get("severity", "medium")
                title = f"Drift Detection: {data.get('detection_type', 'Unknown')}"
                message = f"Drift detected with score {drift_score:.2f} (threshold: {threshold:.2f})"

        elif event_type == "cost_spike":
            # Cost spike detection (can be enhanced with threshold from settings)
            should_alert = True
            severity = "high"
            title = f"Cost Spike Detected"
            message = f"Unusual cost increase detected: ${data.get('cost', 0):.2f}"

        if not should_alert:
            return None

        # Create alert
        alert = Alert(
            project_id=project_id,
            alert_type=alert_type,
            severity=severity,
            title=title,
            message=message,
            alert_data=data
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        # Check if alert should be sent based on settings
        if self._should_send_alert(settings, alert, db):
            # Determine channels
            channels = []
            if settings:
                if settings.email_enabled:
                    channels.append("email")
                if settings.slack_enabled and settings.slack_webhook_url:
                    channels.append("slack")
                if settings.discord_enabled and settings.discord_webhook_url:
                    channels.append("discord")
            else:
                # Default: email only
                channels = ["email"]

            # Send alert
            if channels:
                results = await self.send_alert(alert, channels, db)
                
                # Update alert status
                if any(r.get("status") == "sent" for r in results.values()):
                    alert.is_sent = True
                    alert.sent_at = datetime.utcnow()
                    alert.notification_channels = channels
                    db.commit()

        logger.info(
            f"Auto-triggered alert for project {project_id}: {event_type}",
            extra={"project_id": project_id, "alert_id": alert.id, "event_type": event_type}
        )

        return alert
