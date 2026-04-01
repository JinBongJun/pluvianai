import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ReleaseGateRun(Base):
    """Indexed summary row for Release Gate history browsing."""

    __tablename__ = "release_gate_runs"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(
        String(255),
        ForeignKey("behavior_reports.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    trace_id = Column(String(255), nullable=True, index=True)
    baseline_trace_id = Column(String(255), nullable=True)
    agent_id = Column(String(100), nullable=True, index=True)
    status = Column(String(20), nullable=False, index=True)
    mode = Column(String(50), nullable=False, default="replay_test")
    repeat_runs = Column(Integer, nullable=True)
    total_inputs = Column(Integer, nullable=True)
    passed_runs = Column(Integer, nullable=True)
    failed_runs = Column(Integer, nullable=True)
    passed_attempts = Column(Integer, nullable=True)
    total_attempts = Column(Integer, nullable=True)
    thresholds_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    report = relationship("BehaviorReport", backref="release_gate_run", uselist=False)
    project = relationship("Project", backref="release_gate_runs")
