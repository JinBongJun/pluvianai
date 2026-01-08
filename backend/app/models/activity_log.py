"""
Activity log model for tracking user actions
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ActivityLog(Base):
    """Activity log model for tracking user actions"""
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    
    # Activity metadata
    activity_type = Column(String(50), nullable=False, index=True)  # project_create, project_update, member_add, etc.
    action = Column(String(100), nullable=False)  # "Created project", "Added member", etc.
    description = Column(Text, nullable=True)  # Detailed description
    
    # Activity data (stored as JSONB)
    activity_data = Column(JSON, nullable=True)  # Additional context
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user = relationship("User", back_populates="activity_logs")
    project = relationship("Project", back_populates="activity_logs")

    # Indexes
    __table_args__ = (
        Index('idx_activity_user_created', 'user_id', 'created_at'),
        Index('idx_activity_project_created', 'project_id', 'created_at'),
    )
