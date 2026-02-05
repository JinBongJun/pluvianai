import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class LiveViewConnection(Base):
    """User-drawn Live View arrows (visual only)."""

    __tablename__ = "live_view_connections"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    source_agent_name = Column(String(100), nullable=False)
    target_agent_name = Column(String(100), nullable=False)

    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
