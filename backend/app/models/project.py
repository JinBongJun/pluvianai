"""
Project model for multi-tenancy
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Project(Base):
    """Project/Workspace model"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Shadow Routing configuration (JSON)
    # Example structure:
    # {
    #   "enabled": true,
    #   "shadow_models": {
    #     "gpt-4": "gpt-4-turbo",  # Same provider, newer model
    #     "gpt-4-turbo": "claude-3-opus",  # Cross-provider comparison
    #     "claude-3-opus": "claude-3-haiku"  # Cost optimization
    #   },
    #   "comparison_threshold": 0.15  # 15% difference triggers alert
    # }
    # Shadow models can be:
    # - Same provider: gpt-4 -> gpt-4-turbo, gpt-4 -> o1-preview
    # - Different provider: gpt-4 -> claude-3-opus, claude-3 -> gemini-ultra
    # - Cost optimization: gpt-4 -> gpt-3.5-turbo, claude-3-opus -> claude-3-haiku
    shadow_routing_config = Column(JSON, nullable=True)

    # Relationships
    owner = relationship("User", back_populates="projects")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    api_calls = relationship("APICall", back_populates="project", cascade="all, delete-orphan")
    quality_scores = relationship("QualityScore", back_populates="project", cascade="all, delete-orphan")
    drift_detections = relationship("DriftDetection", back_populates="project", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="project", cascade="all, delete-orphan")
    usage_records = relationship("Usage", back_populates="project", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="project", cascade="all, delete-orphan")
    webhooks = relationship("Webhook", back_populates="project", cascade="all, delete-orphan")
    shadow_comparisons = relationship("ShadowComparison", back_populates="project", cascade="all, delete-orphan")



