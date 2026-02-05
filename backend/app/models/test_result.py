import uuid
from sqlalchemy import (
    Column,
    String,
    Integer,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
    Text,
    Numeric,
)
from sqlalchemy.sql import func
from app.core.database import Base


class TestResult(Base):
    """Test Lab / Replay result records"""

    __tablename__ = "test_results"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(String(100), nullable=True, index=True)
    test_run_id = Column(String(255), ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=True, index=True)

    # Chain/parallel metadata
    step_order = Column(Integer, nullable=True)
    parent_step_id = Column(String(255), nullable=True)
    is_parallel = Column(Boolean, default=False, server_default="false")

    # Prompt/response
    input = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=True)
    model = Column(String(100), nullable=True)
    response = Column(Text, nullable=True)

    # Metrics
    latency_ms = Column(Integer, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    cost = Column(Numeric(10, 6), nullable=True)

    # Signal / Worst flags
    signal_result = Column(JSON, nullable=True)
    is_worst = Column(Boolean, default=False, server_default="false")
    worst_status = Column(String(20), nullable=True)

    # Baseline comparison
    baseline_snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="SET NULL"), nullable=True)
    baseline_response = Column(Text, nullable=True)

    # Source (replay/regression/test_lab/chain_test)
    source = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
