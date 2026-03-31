from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class EntitlementSnapshot(Base):
    """Append-only snapshot of the effective plan and limits exposed to the user."""

    __tablename__ = "entitlement_snapshots"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True, index=True)
    effective_plan_id = Column(String(64), nullable=False, index=True)
    entitlement_status = Column(String(32), nullable=False, index=True)
    effective_from = Column(DateTime(timezone=True), nullable=False)
    effective_to = Column(DateTime(timezone=True), nullable=True)
    limits_json = Column(JSON, nullable=False)
    features_json = Column(JSON, nullable=False)
    source = Column(String(32), nullable=False, default="system")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User")
    subscription = relationship("Subscription")
