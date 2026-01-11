"""
Shadow Comparison model for storing Shadow Routing comparison results
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ShadowComparison(Base):
    """Shadow Routing comparison result model"""
    __tablename__ = "shadow_comparisons"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    
    # Primary (production) API call
    primary_api_call_id = Column(Integer, ForeignKey("api_calls.id"), nullable=False, index=True)
    primary_model = Column(String(100), nullable=False)  # Original model (e.g., "gpt-4")
    
    # Shadow API call
    shadow_api_call_id = Column(Integer, ForeignKey("api_calls.id"), nullable=False, index=True)
    shadow_model = Column(String(100), nullable=False)  # Shadow model (e.g., "gpt-3.5-turbo")
    
    # Comparison results
    similarity_score = Column(Float, nullable=True)  # 0-1 (1 = identical)
    difference_type = Column(String(50), nullable=True)  # length, content, structure, latency, cost
    difference_percentage = Column(Float, nullable=True)  # Percentage difference
    difference_details = Column(JSON, nullable=True)  # Detailed comparison data
    
    # Alert status
    alert_sent = Column(Boolean, default=False)
    alert_id = Column(Integer, ForeignKey("alerts.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="shadow_comparisons")
    primary_api_call = relationship("APICall", foreign_keys=[primary_api_call_id], back_populates="primary_shadow_comparisons")
    shadow_api_call = relationship("APICall", foreign_keys=[shadow_api_call_id], back_populates="shadow_shadow_comparisons")
    alert = relationship("Alert", foreign_keys=[alert_id])

