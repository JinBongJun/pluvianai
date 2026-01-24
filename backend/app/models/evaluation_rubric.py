from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, func
from app.core.database import Base

class EvaluationRubric(Base):
    """Developer-defined criteria for LLM-as-a-Judge evaluations"""
    __tablename__ = "evaluation_rubrics"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # The actual instructions for the Judge LLM
    # Example: "Evaluate the response for politeness. Score 1 if rude, 5 if very polite."
    criteria_prompt = Column(Text, nullable=False)
    
    # Target score range (usually 1-5)
    min_score = Column(Integer, default=1)
    max_score = Column(Integer, default=5)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
