"""
User Agreement model for tracking liability agreements
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class UserAgreement(Base):
    """User Agreement model for tracking liability agreements"""

    __tablename__ = "user_agreements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    liability_agreement_accepted = Column(Boolean, default=False)
    liability_agreement_accepted_at = Column(DateTime(timezone=True), nullable=True)
    terms_of_service_accepted = Column(Boolean, default=False)
    terms_of_service_accepted_at = Column(DateTime(timezone=True), nullable=True)
    privacy_policy_accepted = Column(Boolean, default=False)
    privacy_policy_accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="user_agreement")
