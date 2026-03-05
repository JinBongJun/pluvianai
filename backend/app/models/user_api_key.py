"""
User API Key model for storing encrypted user-provided API keys
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class UserApiKey(Base):
    """User-provided API key (encrypted) for Judge calls"""

    __tablename__ = "user_api_keys"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Optional node(agent) scope. When null, this key is project default for provider.
    agent_id = Column(String(255), nullable=True, index=True)

    # Provider and encrypted key
    provider = Column(String(50), nullable=False, index=True)  # openai, anthropic, google
    encrypted_key = Column(Text, nullable=False)  # Encrypted API key (Fernet)

    # Metadata
    name = Column(String(255), nullable=True)  # Optional name for the key
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project = relationship("Project", foreign_keys=[project_id])
    user = relationship("User", foreign_keys=[user_id])

    # Indexes
    __table_args__ = (
        Index("idx_user_api_key_project_provider", "project_id", "provider"),
        Index("idx_user_api_key_project_provider_agent", "project_id", "provider", "agent_id"),
    )
