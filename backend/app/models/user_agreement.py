from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class UserAgreement(Base):
    """Model for tracking user acceptance of ToS/Privacy policy"""
    __tablename__ = "user_agreements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Atomic Security Protocol (was Liability Agreement)
    liability_agreement_accepted = Column(Boolean, default=False)
    liability_agreement_accepted_at = Column(DateTime(timezone=True), nullable=True)
    
    # Core Terms
    terms_of_service_accepted = Column(Boolean, default=False)
    terms_of_service_accepted_at = Column(DateTime(timezone=True), nullable=True)
    
    privacy_policy_accepted = Column(Boolean, default=False)
    privacy_policy_accepted_at = Column(DateTime(timezone=True), nullable=True)
    
    version = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="user_agreement")
