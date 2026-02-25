import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON, Float, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class TrajectoryStep(Base):
    """Normalized trajectory steps for trace/test-run validation."""

    __tablename__ = "trajectory_steps"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    trace_id = Column(String(255), nullable=True, index=True)
    test_run_id = Column(String(255), ForeignKey("test_runs.id", ondelete="SET NULL"), nullable=True, index=True)

    step_order = Column(Float, nullable=False, index=True)
    parent_step_id = Column(String(255), nullable=True)
    is_parallel = Column(Boolean, nullable=False, default=False, server_default="false")

    step_type = Column(String(30), nullable=False, index=True)  # llm_call/tool_call/tool_result/error
    agent_id = Column(String(100), nullable=True, index=True)
    tool_name = Column(String(255), nullable=True, index=True)
    tool_args = Column(JSON, nullable=True)
    tool_result = Column(JSON, nullable=True)
    latency_ms = Column(Float, nullable=True)

    source_type = Column(String(50), nullable=True)  # snapshot/test_result
    source_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project = relationship("Project", backref="trajectory_steps")
    test_run = relationship("TestRun", backref="trajectory_steps")
