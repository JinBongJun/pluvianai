from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Trace(Base):
    """Trace model for grouping related AI requests (AIOS Swarm)"""
    __tablename__ = "traces"

    id = Column(String(255), primary_key=True, index=True) # UUID or Trace-ID from Proxy
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", backref="traces")
    snapshots = relationship("Snapshot", back_populates="trace", cascade="all, delete-orphan")
