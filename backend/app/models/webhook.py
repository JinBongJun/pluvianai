"""
Webhook model for external integrations
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Webhook(Base):
    """Webhook model for external integrations"""

    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)  # None for user-level webhooks

    # Webhook configuration
    name = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    secret = Column(String(255), nullable=True)  # For webhook signature verification

    # Event subscriptions
    events = Column(JSON, nullable=False)  # ["drift", "cost_spike", "error", etc.]

    # Status
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    failure_count = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="webhooks")
    project = relationship("Project", back_populates="webhooks")

    # Indexes
    __table_args__ = (
        Index("idx_webhook_user_active", "user_id", "is_active"),
        Index("idx_webhook_project_active", "project_id", "is_active"),
    )
