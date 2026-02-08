from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class PIIPattern(Base):
    """Model for PII detection patterns (regex/AI)"""
    __tablename__ = "pii_patterns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    pattern = Column(Text, nullable=False) # regex or description
    is_active = Column(Boolean, default=True, server_default="true")
    
    entity_type = Column(String(50), nullable=True) # email, credit_card, etc
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
