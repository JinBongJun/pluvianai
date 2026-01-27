"""
Refresh Token model for tracking refresh tokens with rotation support
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class RefreshToken(Base):
    """Refresh Token model for tracking issued refresh tokens"""

    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(255), unique=True, nullable=False, index=True)  # SHA256 hash of the token
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    is_revoked = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="refresh_tokens")

    # Indexes for efficient queries
    __table_args__ = (
        Index("idx_refresh_token_user_expires", "user_id", "expires_at"),
        Index("idx_refresh_token_hash", "token_hash"),
    )
