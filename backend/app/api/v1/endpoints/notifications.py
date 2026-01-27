"""
Notification settings endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.project_notification_settings import ProjectNotificationSettings
from app.services.alert_service import AlertService
from app.infrastructure.repositories.alert_repository import AlertRepository

router = APIRouter()


class NotificationSettingsRequest(BaseModel):
    """Request schema for notification settings"""
    email_enabled: bool = True
    slack_enabled: bool = False
    slack_webhook_url: Optional[str] = Field(None, max_length=500)
    discord_enabled: bool = False
    discord_webhook_url: Optional[str] = Field(None, max_length=500)
    alert_types: List[str] = Field(default=["drift", "cost_spike", "error"])
    severity_threshold: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    min_interval_minutes: int = Field(default=15, ge=1, le=1440)
    quality_score_threshold: Optional[float] = Field(None, ge=0, le=100)
    error_rate_threshold: Optional[float] = Field(None, ge=0, le=100)
    drift_threshold: Optional[float] = Field(None, ge=0, le=100)


class NotificationSettingsResponse(BaseModel):
    """Response schema for notification settings"""
    id: int
    project_id: int
    user_id: int
    email_enabled: bool
    slack_enabled: bool
    slack_webhook_url: Optional[str]
    discord_enabled: bool
    discord_webhook_url: Optional[str]
    alert_types: List[str]
    severity_threshold: str
    min_interval_minutes: int
    quality_score_threshold: Optional[float]
    error_rate_threshold: Optional[float]
    drift_threshold: Optional[float]
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class TestNotificationRequest(BaseModel):
    """Request schema for test notification"""
    channel: str = Field(..., pattern="^(email|slack|discord)$")


def get_alert_service(db: Session = Depends(get_db)) -> AlertService:
    """Dependency to get alert service"""
    alert_repo = AlertRepository(db)
    return AlertService(alert_repo, db)


@router.get("/projects/{project_id}/notifications/settings", response_model=NotificationSettingsResponse)
@handle_errors
async def get_notification_settings(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get notification settings for a project and user
    """
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Get or create settings
    settings = (
        db.query(ProjectNotificationSettings)
        .filter(
            ProjectNotificationSettings.project_id == project_id,
            ProjectNotificationSettings.user_id == current_user.id
        )
        .first()
    )

    if not settings:
        # Create default settings
        settings = ProjectNotificationSettings(
            project_id=project_id,
            user_id=current_user.id,
            email_enabled=True,
            slack_enabled=False,
            alert_types=["drift", "cost_spike", "error"],
            severity_threshold="medium",
            min_interval_minutes=15
        )
        db.add(settings)
        # Commit handled automatically by get_db() dependency
        db.refresh(settings)

    return success_response(data=settings)


@router.put("/projects/{project_id}/notifications/settings", response_model=NotificationSettingsResponse)
@handle_errors
async def update_notification_settings(
    project_id: int,
    request: NotificationSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update notification settings for a project and user
    """
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Get or create settings
    settings = (
        db.query(ProjectNotificationSettings)
        .filter(
            ProjectNotificationSettings.project_id == project_id,
            ProjectNotificationSettings.user_id == current_user.id
        )
        .first()
    )

    if not settings:
        settings = ProjectNotificationSettings(
            project_id=project_id,
            user_id=current_user.id
        )
        db.add(settings)

    # Update settings
    settings.email_enabled = request.email_enabled
    settings.slack_enabled = request.slack_enabled
    settings.slack_webhook_url = request.slack_webhook_url
    settings.discord_enabled = request.discord_enabled
    settings.discord_webhook_url = request.discord_webhook_url
    settings.alert_types = request.alert_types
    settings.severity_threshold = request.severity_threshold
    settings.min_interval_minutes = request.min_interval_minutes
    settings.quality_score_threshold = request.quality_score_threshold
    settings.error_rate_threshold = request.error_rate_threshold
    settings.drift_threshold = request.drift_threshold

    # Commit handled automatically by get_db() dependency
    db.refresh(settings)

    logger.info(
        f"Notification settings updated for project {project_id} by user {current_user.id}",
        extra={"project_id": project_id, "user_id": current_user.id}
    )

    return success_response(data=settings)


@router.post("/projects/{project_id}/notifications/test")
@handle_errors
async def send_test_notification(
    project_id: int,
    request: TestNotificationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    alert_service: AlertService = Depends(get_alert_service),
):
    """
    Send a test notification to verify settings
    """
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Get settings
    settings = (
        db.query(ProjectNotificationSettings)
        .filter(
            ProjectNotificationSettings.project_id == project_id,
            ProjectNotificationSettings.user_id == current_user.id
        )
        .first()
    )

    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification settings not found. Please configure settings first."
        )

    # Check if channel is enabled
    if request.channel == "email" and not settings.email_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email notifications are not enabled"
        )

    if request.channel == "slack" and not settings.slack_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slack notifications are not enabled"
        )

    if request.channel == "slack" and not settings.slack_webhook_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slack webhook URL is not configured"
        )

    if request.channel == "discord" and not settings.discord_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discord notifications are not enabled"
        )

    if request.channel == "discord" and not settings.discord_webhook_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discord webhook URL is not configured"
        )

    # Create a test alert
    from app.models.alert import Alert
    from app.models.project import Project
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    test_alert = Alert(
        project_id=project_id,
        alert_type="test",
        severity="low",
        title="Test Notification",
        message="This is a test notification to verify your notification settings are working correctly.",
        alert_data={"test": True}
    )
    db.add(test_alert)
    # Commit handled automatically by get_db() dependency
    db.refresh(test_alert)

    # Send test notification
    channels = [request.channel]
    results = await alert_service.send_alert(test_alert, channels, db=db)

    if results.get(request.channel, {}).get("status") == "sent":
        return success_response(
            data={"message": f"Test notification sent successfully via {request.channel}"}
        )
    else:
        error_msg = results.get(request.channel, {}).get("message", "Unknown error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send test notification: {error_msg}"
        )
