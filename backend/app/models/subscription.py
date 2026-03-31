from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Subscription(Base):
    """Model for organization/user billing subscriptions"""
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    plan_id = Column(String(50), nullable=False, default="free")
    status = Column(String(20), default="active")

    stripe_subscription_id = Column(String(255), nullable=True, index=True)
    paddle_subscription_id = Column(String(255), nullable=True, index=True)
    paddle_customer_id = Column(String(255), nullable=True, index=True)
<<<<<<< HEAD
    provider = Column(String(32), nullable=False, server_default="paddle")
    provider_environment = Column(String(16), nullable=False, server_default="unknown")
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    canceled_at = Column(DateTime(timezone=True), nullable=True)
    cancel_effective_at = Column(DateTime(timezone=True), nullable=True)
    last_provider_event_at = Column(DateTime(timezone=True), nullable=True)
    last_reconciled_at = Column(DateTime(timezone=True), nullable=True)
=======
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
>>>>>>> origin/main

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="subscription")

    def __init__(self, **kwargs):
        # Accept legacy kwargs from mixed call sites without failing.
        plan_type = kwargs.get("plan_type")
        plan_id = kwargs.get("plan_id")
        if plan_type and not plan_id:
            kwargs["plan_id"] = plan_type
        for legacy_key in (
            "price_per_month",
            "trial_end",
            "cancel_at_period_end",
        ):
            kwargs.pop(legacy_key, None)
        super().__init__(**kwargs)

    @property
    def plan_type(self) -> str:
        return self.plan_id or "free"

    @plan_type.setter
    def plan_type(self, value: str) -> None:
        self.plan_id = value

    @property
    def price_per_month(self):
        return getattr(self, "_price_per_month", None)

    @price_per_month.setter
    def price_per_month(self, value):
        self._price_per_month = value

    @property
    def trial_end(self):
        return getattr(self, "_trial_end", None)

    @trial_end.setter
    def trial_end(self, value):
        self._trial_end = value
