"""
Alert model for storing notification history
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Alert(Base):
    """Alert/Notification model"""

    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    # Alert metadata
    alert_type = Column(String(50), nullable=False, index=True)  # drift, cost_spike, error, timeout, model_update
    severity = Column(String(20), nullable=False, default="medium")  # low, medium, high, critical
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)

    # Alert data (stored as JSONB)
    alert_data = Column(JSON, nullable=True)  # Additional context

    # Notification status
    is_sent = Column(Boolean, default=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    notification_channels = Column(JSON, nullable=True)  # ["slack", "email", "discord"]

    # Resolution
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="alerts")
