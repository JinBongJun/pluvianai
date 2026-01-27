"""
Project Notification Settings model for project-specific notification preferences
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ProjectNotificationSettings(Base):
    """Project-specific notification settings model"""

    __tablename__ = "project_notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Channel settings
    email_enabled = Column(Boolean, default=True, nullable=False)
    slack_enabled = Column(Boolean, default=False, nullable=False)
    slack_webhook_url = Column(String(500), nullable=True)
    discord_enabled = Column(Boolean, default=False, nullable=False)
    discord_webhook_url = Column(String(500), nullable=True)

    # Alert conditions
    alert_types = Column(JSON, default=["drift", "cost_spike", "error"], nullable=False)  # List of alert types to notify
    severity_threshold = Column(String(20), default="medium", nullable=False)  # low, medium, high, critical
    min_interval_minutes = Column(Integer, default=15, nullable=False)  # Minimum interval between notifications

    # Trigger conditions
    quality_score_threshold = Column(Float, nullable=True)  # Alert if quality score drops below this
    error_rate_threshold = Column(Float, nullable=True)  # Alert if error rate exceeds this (percentage)
    drift_threshold = Column(Float, nullable=True)  # Alert if drift score exceeds this

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="notification_settings")
    user = relationship("User")

    # Unique constraint: one setting per user per project
    __table_args__ = (
        UniqueConstraint('project_id', 'user_id', name='uq_project_notification_settings_project_user'),
    )
