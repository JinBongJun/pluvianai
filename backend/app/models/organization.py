"""
Organization model for multi-tenant structure
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Organization(Base):
    """Organization model"""

    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    type = Column(String(50), nullable=True)  # personal, startup, company, agency, educational, na
    plan_type = Column(String(20), nullable=False, default="free")  # free, pro, enterprise
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Paddle billing fields
    paddle_customer_id = Column(String(255), nullable=True, unique=True, index=True)
    paddle_subscription_id = Column(String(255), nullable=True, unique=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_org_owner", "owner_id"),
        Index("idx_org_plan", "plan_type"),
    )
