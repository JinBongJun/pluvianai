from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship, synonym
from sqlalchemy.sql import func
from app.core.database import Base

class QualityScore(Base):
    """Model for tracking AI output quality metrics"""
    __tablename__ = "quality_scores"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    api_call_id = Column(Integer, ForeignKey("api_calls.id", ondelete="CASCADE"), nullable=True, index=True)
    score = Column(Float, nullable=False)
    overall_score = synonym("score")
    metric_name = Column(String(100), nullable=True)  # e.g., bleu, rouge, custom-judge

    json_valid = Column(Boolean, nullable=True)
    required_fields_present = Column(Boolean, nullable=True)
    length_acceptable = Column(Boolean, nullable=True)
    format_valid = Column(Boolean, nullable=True)
    semantic_consistency_score = Column(Float, nullable=True)
    tone_score = Column(Float, nullable=True)
    coherence_score = Column(Float, nullable=True)
    evaluation_details = Column(JSON, nullable=True)
    violations = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="quality_scores")
    api_call = relationship("APICall", back_populates="quality_scores")
