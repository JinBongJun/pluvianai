from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class BillingEvent(Base):
    """Append-only billing event log for webhook and reconciliation visibility."""

    __tablename__ = "billing_events"
    __table_args__ = (
        Index("ux_billing_events_idempotency_key", "idempotency_key", unique=True),
        Index(
            "ux_billing_events_provider_event",
            "provider",
            "provider_environment",
            "provider_event_id",
            unique=True,
        ),
    )

    id = Column(Integer, primary_key=True)
    provider = Column(String(32), nullable=False, default="paddle")
    provider_environment = Column(String(16), nullable=False, default="unknown")
    provider_event_id = Column(String(255), nullable=False, index=True)
    event_type = Column(String(128), nullable=False, index=True)
    event_created_at = Column(DateTime(timezone=True), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    processing_status = Column(String(32), nullable=False, default="received", index=True)
    processing_error = Column(String, nullable=True)
    payload_json = Column(JSON, nullable=False)
    payload_hash = Column(String(64), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    subscription_id = Column(
        Integer,
        ForeignKey("subscriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    provider_customer_id = Column(String(255), nullable=True, index=True)
    provider_subscription_id = Column(String(255), nullable=True, index=True)
    idempotency_key = Column(String(255), nullable=False)
    replay_count = Column(Integer, nullable=False, default=0)

    user = relationship("User")
    subscription = relationship("Subscription")
