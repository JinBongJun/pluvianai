from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class SharedResult(Base):
    """Model for public/shared test reports and results"""
    __tablename__ = "shared_results"

    id = Column(String(255), primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    test_run_id = Column(String(255), ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=True)
    
    share_token = Column(String(255), unique=True, index=True)
    is_public = Column(Boolean, default=False)
    
    settings = Column(JSON, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", backref="shared_results")
