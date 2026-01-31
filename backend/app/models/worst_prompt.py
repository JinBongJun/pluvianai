"""
Worst Prompt model for storing problematic prompts/cases
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Text, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class WorstPromptReason(str, enum.Enum):
    """Reasons why a prompt was flagged as worst"""
    FAILURE_RESPONSE = "failure_response"
    LONG_RESPONSE = "long_response"
    HALLUCINATION_SUSPECTED = "hallucination_suspected"
    CUSTOMER_COMPLAINT = "customer_complaint"
    REFUSAL_INCREASE = "refusal_increase"
    JSON_BREAK = "json_break"
    LATENCY_ISSUE = "latency_issue"
    MANUAL_FLAG = "manual_flag"


class WorstPrompt(Base):
    """Worst Prompt model - stores problematic prompts for testing"""
    __tablename__ = "worst_prompts"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Prompt information
    prompt_text = Column(Text, nullable=False)  # The actual prompt
    context = Column(JSON, nullable=True)  # Additional context (system prompt, etc.)
    
    # Classification
    reason = Column(String(50), nullable=False, index=True)  # Why it's flagged
    severity_score = Column(Float, default=0.5)  # 0.0 - 1.0 (how bad)
    
    # Metadata
    model = Column(String(100), nullable=True)
    provider = Column(String(50), nullable=True)
    
    # Response info (for reference)
    original_response = Column(Text, nullable=True)
    response_metadata = Column(JSON, nullable=True)
    
    # Flags
    is_active = Column(Boolean, default=True)  # Include in test set
    is_reviewed = Column(Boolean, default=False)  # Human reviewed
    
    # Clustering (for grouping similar prompts)
    cluster_id = Column(String(100), nullable=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", backref="worst_prompts")


class WorstPromptSet(Base):
    """Worst Prompt Set - groups worst prompts into test sets"""
    __tablename__ = "worst_prompt_sets"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Set information
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Configuration
    auto_collect = Column(Boolean, default=True)  # Auto-collect new worst prompts
    max_prompts = Column(Integer, default=100)  # Max prompts in set
    
    # Criteria for auto-collection
    collection_criteria = Column(JSON, nullable=True)
    
    # Stats
    prompt_count = Column(Integer, default=0)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", backref="worst_prompt_sets")
    prompts = relationship("WorstPromptSetMember", back_populates="prompt_set")


class WorstPromptSetMember(Base):
    """Many-to-many relationship between WorstPromptSet and WorstPrompt"""
    __tablename__ = "worst_prompt_set_members"

    id = Column(Integer, primary_key=True, index=True)
    prompt_set_id = Column(Integer, ForeignKey("worst_prompt_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    worst_prompt_id = Column(Integer, ForeignKey("worst_prompts.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Order in set
    order = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    prompt_set = relationship("WorstPromptSet", back_populates="prompts")
    worst_prompt = relationship("WorstPrompt")
