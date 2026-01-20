"""
Notification Settings model for user notification preferences
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class NotificationSettings(Base):
    """Notification Settings model"""

    __tablename__ = "notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)

    # Email notifications
    email_drift = Column(Boolean, default=True, nullable=False)
    email_cost_anomaly = Column(Boolean, default=True, nullable=False)
    email_quality_drop = Column(Boolean, default=True, nullable=False)

    # In-app notifications
    in_app_drift = Column(Boolean, default=True, nullable=False)
    in_app_cost_anomaly = Column(Boolean, default=True, nullable=False)
    in_app_quality_drop = Column(Boolean, default=True, nullable=False)

    # Slack integration
    slack_enabled = Column(Boolean, default=False, nullable=False)
    slack_webhook_url = Column(Text, nullable=True)

    # Discord integration
    discord_enabled = Column(Boolean, default=False, nullable=False)
    discord_webhook_url = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="notification_settings")
