"""
Usage tracking model for subscription limits
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, BigInteger, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Usage(Base):
    """Usage tracking model"""
    __tablename__ = "usage"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    metric_type = Column(String(50), nullable=False)  # api_calls, storage_gb, team_members, etc.
    current_usage = Column(BigInteger, default=0)  # Use BigInteger for large numbers
    limit = Column(BigInteger, nullable=True)  # -1 means unlimited
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="usage_records")
    project = relationship("Project", back_populates="usage_records")

    # Indexes
    __table_args__ = (
        Index('idx_usage_user_metric', 'user_id', 'metric_type', 'period_start'),
        Index('idx_usage_project_metric', 'project_id', 'metric_type', 'period_start'),
    )

