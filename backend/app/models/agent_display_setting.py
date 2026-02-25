import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean, UniqueConstraint, JSON
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
    node_type = Column(String(50), nullable=True, server_default="agentCard")
    is_deleted = Column(Boolean, default=False, server_default="false")
    
    # Custom thresholds for this specific agent (Overrides Project-level config)
    diagnostic_config = Column(JSON, nullable=True, server_default='{}')

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
