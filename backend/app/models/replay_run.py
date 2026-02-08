from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, BigInteger, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class ReplayRun(Base):
    """Model for batch replay and regression testing runs"""
    __tablename__ = "replay_runs"

    id = Column(String(255), primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    run_type = Column(String(20), nullable=True)
    target_model = Column(String(100), nullable=True)
    
    snapshot_count = Column(Integer, default=0)
    status = Column(String(20), default="pending") # pending, running, completed, failed
    
    total_latency_ms = Column(BigInteger, default=0)
    total_cost = Column(Numeric(10, 4), default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", backref="replay_runs")
