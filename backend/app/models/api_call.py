from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class APICall(Base):
    """Model for tracking LLM API calls and costs"""
    __tablename__ = "api_calls"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    provider = Column(String(50), nullable=True) # openai, anthropic, etc
    model = Column(String(100), nullable=True)
    agent_name = Column(String(100), nullable=True)
    
    request_content = Column(Text, nullable=True)
    response_content = Column(Text, nullable=True)
    
    total_tokens = Column(Integer, nullable=True)
    cost = Column(Float, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    status_code = Column(Integer, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="api_calls")
