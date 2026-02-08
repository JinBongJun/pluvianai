from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, BigInteger
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
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user = relationship("User", back_populates="usage_records")
    project = relationship("Project", back_populates="usage_records")
