"""
Shared Result model for shareable verdict links
"""

import secrets
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class SharedResult(Base):
    """Shared result for guest view (read-only)"""

    __tablename__ = "shared_results"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Share token (unique, URL-safe)
    token = Column(String(64), unique=True, nullable=False, index=True)

    # Result metadata
    result_type = Column(String(50), nullable=False, index=True)  # 'model_validation', 'snapshot', 'test', etc.
    result_id = Column(Integer, nullable=True)  # ID of the original result (if applicable)
    result_data = Column(JSON, nullable=False)  # The actual result data (JSONB)

    # Access control
    read_only = Column(Boolean, default=True, nullable=False)  # Always true for shared results
    expires_at = Column(DateTime(timezone=True), nullable=True)  # Optional expiration

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", foreign_keys=[project_id])
    user = relationship("User", foreign_keys=[created_by])

    # Indexes
    __table_args__ = (
        Index("idx_shared_result_token", "token"),
        Index("idx_shared_result_project", "project_id", "created_at"),
    )

    @staticmethod
    def generate_token() -> str:
        """Generate a unique share token"""
        return secrets.token_urlsafe(32)
