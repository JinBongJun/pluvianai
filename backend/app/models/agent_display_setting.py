import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class AgentDisplaySetting(Base):
    """Display customization for detected agents (Live View/Test Lab)."""

    __tablename__ = "agent_display_settings"
    __table_args__ = (
        UniqueConstraint("system_prompt_hash", name="uq_agent_display_settings_system_prompt_hash"),
    )

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    system_prompt_hash = Column(String(64), nullable=False)
    display_name = Column(String(100), nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="false")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
