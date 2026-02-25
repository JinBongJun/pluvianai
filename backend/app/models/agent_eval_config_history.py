"""Eval config history for time-based evaluation: apply the config that was active at each snapshot's created_at."""
import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class AgentEvalConfigHistory(Base):
    """One row per eval config save. Used to evaluate each snapshot with the config that was active at its created_at."""

    __tablename__ = "agent_eval_config_history"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(String(64), nullable=False, index=True)  # system_prompt_hash
    effective_from = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    eval_config = Column(JSON, nullable=False)  # normalized eval config at save time
