from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Webhook(Base):
    """Model for outbound alert/event webhooks"""
    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    
    url = Column(String(1000), nullable=False)
    name = Column(String(100), nullable=True)
    secret = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, server_default="true")
    
    events = Column(Text, nullable=True) # JSON or comma-separated list of events
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="webhooks")
    project = relationship("Project", back_populates="webhooks")
