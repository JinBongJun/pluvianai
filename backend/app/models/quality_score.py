"""
Quality Score model for storing quality evaluation results
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, JSON, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class QualityScore(Base):
    """Quality evaluation result model"""

    __tablename__ = "quality_scores"

    id = Column(Integer, primary_key=True, index=True)
    api_call_id = Column(Integer, ForeignKey("api_calls.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)

    # Overall quality score (0-100)
    overall_score = Column(Float, nullable=False)

    # Rule-based scores
    json_valid = Column(Boolean, nullable=True)  # JSON schema validation
    required_fields_present = Column(Boolean, nullable=True)  # Required fields check
    length_acceptable = Column(Boolean, nullable=True)  # Length check
    format_valid = Column(Boolean, nullable=True)  # Format validation

    # LLM-based scores
    semantic_consistency_score = Column(Float, nullable=True)  # 0-100
    tone_score = Column(Float, nullable=True)  # 0-100
    coherence_score = Column(Float, nullable=True)  # 0-100

    # Detailed evaluation data (stored as JSONB)
    evaluation_details = Column(JSON, nullable=True)  # Detailed breakdown
    violations = Column(JSON, nullable=True)  # List of violations found

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    api_call = relationship("APICall", back_populates="quality_scores")
    project = relationship("Project", back_populates="quality_scores")
