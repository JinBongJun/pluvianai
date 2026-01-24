from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Snapshot(Base):
    """Snapshot model for storing raw AI payloads for replay"""
    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True, index=True)
    trace_id = Column(String(255), ForeignKey("traces.id", ondelete="CASCADE"), nullable=False, index=True)
    
    provider = Column(String(50), nullable=False)
    model = Column(String(100), nullable=False)
    
    # The "Frozen" payload (system prompt, user messages, tools, etc.)
    payload = Column(JSON, nullable=False)
    
    # Whether high-risk data (PII) has been masked
    is_sanitized = Column(Boolean, default=False)
    
    # Metadata for filtering (e.g., successful call or failure)
    status_code = Column(Integer, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    trace = relationship("Trace", back_populates="snapshots")
