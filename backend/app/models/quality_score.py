from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class QualityScore(Base):
    """Model for tracking AI output quality metrics"""
    __tablename__ = "quality_scores"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    score = Column(Float, nullable=False)
    metric_name = Column(String(100), nullable=True) # e.g., bleu, rouge, custom-judge
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="quality_scores")
