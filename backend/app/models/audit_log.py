"""
Audit log model for compliance and security tracking
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AuditLog(Base):
    """Audit log model for tracking all important actions for compliance"""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # Nullable for system actions

    # Action metadata
    action = Column(String(100), nullable=False, index=True)  # 'project_created', 'firewall_rule_updated', etc.
    resource_type = Column(String(50), nullable=True, index=True)  # 'project', 'firewall_rule', etc.
    resource_id = Column(Integer, nullable=True)  # ID of the affected resource

    # Change tracking
    old_value = Column(JSON, nullable=True)  # Previous state (JSONB)
    new_value = Column(JSON, nullable=True)  # New state (JSONB)

    # Request metadata
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(Text, nullable=True)  # User agent string

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])

    # Indexes
    __table_args__ = (
        Index("idx_audit_user_created", "user_id", "created_at"),
        Index("idx_audit_resource", "resource_type", "resource_id"),
        Index("idx_audit_action", "action", "created_at"),
    )
