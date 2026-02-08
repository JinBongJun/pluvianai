from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class NotificationSettings(Base):
    """Global user notification preferences"""
    __tablename__ = "notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    email_alerts = Column(Boolean, default=True, server_default="true")
    slack_alerts = Column(Boolean, default=False, server_default="false")
    discord_alerts = Column(Boolean, default=False, server_default="false")
    
    slack_webhook_url = Column(String(1000), nullable=True)
    discord_webhook_url = Column(String(1000), nullable=True)
    
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="notification_settings")
