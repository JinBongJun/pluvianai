from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class ProjectNotificationSettings(Base):
    """Project-specific notification overrides"""
    __tablename__ = "project_notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    email_enabled = Column(Boolean, default=True, server_default="true")
    slack_enabled = Column(Boolean, default=True, server_default="true")
    
    # Overrides or specific channels
    slack_channel = Column(String(100), nullable=True)
    
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="notification_settings")
