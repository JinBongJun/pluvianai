"""
Signal Detection model for storing signal-based detection results
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Float, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum
import uuid


class SignalType(str, enum.Enum):
    """Signal types for detection"""
    HALLUCINATION = "hallucination"
    LENGTH_CHANGE = "length_change"
    REFUSAL_INCREASE = "refusal_increase"
    JSON_SCHEMA_BREAK = "json_schema_break"
    LATENCY_SPIKE = "latency_spike"
    TOOL_MISUSE = "tool_misuse"
    CUSTOM = "custom"


class SignalSeverity(str, enum.Enum):
    """Severity levels for signals"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SignalDetection(Base):
    """Signal Detection model - stores individual signal detection results"""
    __tablename__ = "signal_detections"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=True, index=True)
    
    # Signal information
    signal_type = Column(String(50), nullable=False, index=True)
    severity = Column(String(20), default="medium")
    
    # Detection details
    detected = Column(Boolean, default=False)
    confidence = Column(Float, default=0.0)  # 0.0 - 1.0
    
    # Signal-specific data
    details = Column(JSON, nullable=True)  # Store signal-specific details
    
    # For custom signals
    custom_signal_name = Column(String(255), nullable=True)
    custom_signal_rule = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Relationships
    project = relationship("Project", backref="signal_detections")


class SignalConfig(Base):
    """Signal Configuration - stores custom signal configurations per project"""
    __tablename__ = "signal_configs"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    signal_type = Column(String(50), nullable=False)
    params = Column(JSON, nullable=True)
    severity = Column(String(20), nullable=True)
    enabled = Column(Boolean, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Relationships
    project = relationship("Project", backref="signal_configs")
