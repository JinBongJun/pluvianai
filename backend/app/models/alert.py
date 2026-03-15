from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Alert(Base):
    """Model for system and quality alerts"""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    alert_type = Column(String(50), nullable=False) # drift, quality, cost, etc
    severity = Column(String(20), nullable=False) # info, warning, critical
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    is_resolved = Column(Boolean, default=False, server_default="false")
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="alerts")

    @property
    def message(self) -> str:
        """API contract: expose description as message for responses."""
        return self.description or ""
