"""
Saved Log model.

Stores node-scoped bookmarked snapshots in Live View.
Users can later group saved logs into validation datasets.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.sql import func
from app.core.database import Base


class SavedLog(Base):
    __tablename__ = "saved_logs"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(String(100), nullable=False, index=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "agent_id",
            "snapshot_id",
            name="uq_saved_logs_project_agent_snapshot",
        ),
        Index("idx_saved_logs_project_agent_created", "project_id", "agent_id", "created_at"),
    )
