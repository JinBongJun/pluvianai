import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Numeric, BigInteger
from sqlalchemy.sql import func
from app.core.database import Base


class ReplayRun(Base):
    """Replay run metadata and aggregates."""

    __tablename__ = "replay_runs"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    run_type = Column(String(20), nullable=True)  # model_change, prompt_change, chain_test
    target_model = Column(String(100), nullable=True)
    snapshot_count = Column(Integer, nullable=True)
    repeat_count = Column(Integer, nullable=True)

    safe_count = Column(Integer, nullable=True)
    needs_review_count = Column(Integer, nullable=True)
    critical_count = Column(Integer, nullable=True)

    total_latency_ms = Column(BigInteger, nullable=True)
    total_cost = Column(Numeric(10, 4), nullable=True)

    status = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
