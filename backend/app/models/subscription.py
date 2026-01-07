"""
Subscription model for user plans and billing
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Subscription(Base):
    """Subscription model"""
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    plan_type = Column(String(20), nullable=False, default="free")  # free, indie, startup, pro, enterprise
    status = Column(String(20), nullable=False, default="active")  # active, cancelled, expired, trialing
    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    cancel_at_period_end = Column(String(5), default="false")  # "true" or "false" as string for Paddle compatibility
    trial_end = Column(DateTime(timezone=True), nullable=True)
    paddle_subscription_id = Column(String(255), nullable=True, unique=True, index=True)
    paddle_customer_id = Column(String(255), nullable=True, index=True)
    price_per_month = Column(Float, nullable=True)  # Store actual price for flexibility
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="subscription")

    # Indexes
    __table_args__ = (
        Index('idx_subscription_user_status', 'user_id', 'status'),
        Index('idx_subscription_plan', 'plan_type', 'status'),
    )


