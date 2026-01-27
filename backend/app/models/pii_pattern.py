"""
PII Pattern model for custom project-specific PII patterns
"""

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class PIIPattern(Base):
    """PII Pattern model for custom project-specific patterns"""

    __tablename__ = "pii_patterns"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    pattern = Column(Text, nullable=False)  # Regex pattern
    replacement = Column(String(255), default="[REDACTED]")  # Replacement text
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project = relationship("Project", backref="pii_patterns")
