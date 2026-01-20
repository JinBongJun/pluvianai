"""
Login attempt model for auditing authentication events.
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class LoginAttempt(Base):
    """Record of login attempts for auditing and security analysis."""

    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    ip_address = Column(String(64), nullable=True, index=True)
    user_agent = Column(Text, nullable=True)
    is_success = Column(Boolean, default=False, index=True)
    failure_reason = Column(String(50), nullable=True, index=True)
    geo = Column(String(64), nullable=True)  # optional geolocation code
    device_info = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user = relationship("User", back_populates="login_attempts")
