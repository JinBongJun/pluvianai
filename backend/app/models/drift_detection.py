"""
Drift Detection model for tracking LLM output changes
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class DriftDetection(Base):
    """Drift detection result model"""
    __tablename__ = "drift_detections"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    
    # Detection metadata
    detection_type = Column(String(50), nullable=False, index=True)  # length, structure, semantic, style, latency
    model = Column(String(100), nullable=True, index=True)  # Model being monitored
    agent_name = Column(String(100), nullable=True, index=True)  # Agent being monitored
    
    # Drift metrics
    current_value = Column(Float, nullable=True)  # Current metric value
    baseline_value = Column(Float, nullable=True)  # Baseline (7-day average)
    change_percentage = Column(Float, nullable=False)  # Percentage change
    drift_score = Column(Float, nullable=False)  # Normalized drift score (0-100)
    
    # Detection details (stored as JSONB)
    detection_details = Column(JSON, nullable=True)  # Detailed analysis
    affected_fields = Column(JSON, nullable=True)  # Fields that changed
    
    # Severity
    severity = Column(String(20), nullable=False, default="medium")  # low, medium, high, critical
    
    # Timestamps
    detected_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    baseline_period_start = Column(DateTime(timezone=True), nullable=True)
    baseline_period_end = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="drift_detections")




