from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, BigInteger, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Usage(Base):
    """Model for tracking resource usage (tokens, requests)"""
    __tablename__ = "usage"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    
    metric_name = Column(String(50), nullable=False) # tokens, requests, storage
    quantity = Column(BigInteger, default=0)
    unit = Column(String(20), nullable=True) # count, bytes, usd
    source_type = Column(String(50), nullable=True)
    source_id = Column(String(128), nullable=True)
    idempotency_key = Column(String(255), nullable=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        Index("ix_usage_user_metric_timestamp", "user_id", "metric_name", "timestamp"),
        Index("ix_usage_metric_timestamp", "metric_name", "timestamp"),
        Index("ix_usage_source_type_source_id", "source_type", "source_id"),
        Index("ix_usage_idempotency_key", "idempotency_key", unique=True),
    )

    # Relationships
    user = relationship("User", back_populates="usage_records")
    project = relationship("Project", back_populates="usage_records")
