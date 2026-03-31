"""
User model for authentication and authorization
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, true
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    """User model"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_email_verified = Column(Boolean, nullable=False, default=True, server_default=true())
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Referral (viral engine)
    referral_code = Column(String(50), unique=True, nullable=True, index=True)
    referral_credits = Column(Integer, nullable=True, server_default="0")
    referred_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Legacy Stripe column (unused if you only use Paddle)
    stripe_customer_id = Column(String(255), nullable=True, index=True)
    paddle_customer_id = Column(String(255), nullable=True, index=True)

    # Relationships
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    project_members = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete-orphan")
    usage_records = relationship("Usage", back_populates="user", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="user", cascade="all, delete-orphan")
    webhooks = relationship("Webhook", back_populates="user", cascade="all, delete-orphan")
    notification_settings = relationship(
        "NotificationSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    login_attempts = relationship("LoginAttempt", back_populates="user", cascade="all, delete-orphan")
    organizations = relationship("Organization", back_populates="owner", cascade="all, delete-orphan")
    organization_members = relationship(
        "OrganizationMember", back_populates="user", cascade="all, delete-orphan"
    )
    user_agreement = relationship("UserAgreement", back_populates="user", uselist=False, cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")