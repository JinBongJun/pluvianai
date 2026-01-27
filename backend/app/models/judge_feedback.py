"""
Judge Feedback model for Judge reliability enhancement
"""

from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class JudgeFeedback(Base):
    """Judge feedback for alignment score calculation and reliability tracking"""

    __tablename__ = "judge_feedback"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    evaluation_id = Column(Integer, ForeignKey("quality_scores.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Scores
    judge_score = Column(Float, nullable=False)  # AI Judge score (0-100)
    human_score = Column(Float, nullable=False)  # Human-provided score (0-100)
    alignment_score = Column(Float, nullable=True)  # Calculated alignment (0-100)
    
    # Feedback details
    comment = Column(Text, nullable=True)  # Human feedback comment
    correction_reason = Column(Text, nullable=True)  # Why the correction was made
    
    # Additional metadata
    metadata = Column(JSON, nullable=True)  # Additional feedback data
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="judge_feedback")
    evaluation = relationship("QualityScore", back_populates="judge_feedback")
