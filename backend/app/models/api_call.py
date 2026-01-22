"""
API Call model for storing LLM API request/response logs
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, JSON, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class APICall(Base):
    """API Call log model"""

    __tablename__ = "api_calls"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    # Provider and model information
    provider = Column(String(50), nullable=False, index=True)  # openai, anthropic, google
    model = Column(String(100), nullable=False, index=True)  # gpt-4, claude-3, etc.

    # Request data (stored as JSONB)
    request_data = Column(JSON, nullable=False)  # Full request payload
    request_prompt = Column(Text, nullable=True)  # Extracted prompt for easier querying
    request_tokens = Column(Integer, nullable=True)

    # Response data (stored as JSONB)
    response_data = Column(JSON, nullable=False)  # Full response payload
    response_text = Column(Text, nullable=True)  # Extracted response text
    response_tokens = Column(Integer, nullable=True)

    # Metadata
    latency_ms = Column(Float, nullable=True)  # Response latency in milliseconds
    status_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

    # Agent chain tracking (for multi-agent pipelines)
    agent_name = Column(String(100), nullable=True, index=True)  # router, parser, summarizer, etc.
    chain_id = Column(String(255), nullable=True, index=True)  # UUID to track a full chain

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="api_calls")
    quality_scores = relationship("QualityScore", back_populates="api_call", cascade="all, delete-orphan")
    primary_shadow_comparisons = relationship(
        "ShadowComparison",
        foreign_keys="ShadowComparison.primary_api_call_id",
        back_populates="primary_api_call",
        cascade="all, delete-orphan",
    )
    shadow_shadow_comparisons = relationship(
        "ShadowComparison",
        foreign_keys="ShadowComparison.shadow_api_call_id",
        back_populates="shadow_api_call",
        cascade="all, delete-orphan",
    )

    # Indexes for common queries
    __table_args__ = (
        Index("idx_project_created", "project_id", "created_at"),
        Index("idx_provider_model", "provider", "model"),
        Index("idx_chain_id", "chain_id", "created_at"),
    )
