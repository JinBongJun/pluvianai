"""
Project model for multi-tenancy
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Project(Base):
    """Project/Workspace model"""

    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    is_panic_mode = Column(Boolean, default=False)  # Panic Mode (Global Block) - stored in DB and synced to Redis
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

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
    firewall_rules = relationship("FirewallRule", back_populates="project", cascade="all, delete-orphan")
    judge_feedback = relationship("JudgeFeedback", back_populates="project", cascade="all, delete-orphan")
    notification_settings = relationship("ProjectNotificationSettings", back_populates="project", cascade="all, delete-orphan")
