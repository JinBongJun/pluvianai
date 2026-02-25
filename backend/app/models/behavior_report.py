import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class BehaviorReport(Base):
    """Persisted behavior validation report."""

    __tablename__ = "behavior_reports"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    trace_id = Column(String(255), nullable=True, index=True)
    test_run_id = Column(String(255), ForeignKey("test_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    agent_id = Column(String(100), nullable=True, index=True)

    baseline_report_id = Column(String(255), nullable=True, index=True)
    baseline_run_ref = Column(String(255), nullable=True)
    ruleset_hash = Column(String(64), nullable=True, index=True)

    # pass | fail
    status = Column(String(20), nullable=False, index=True)
    summary_json = Column(JSON, nullable=False)
    violations_json = Column(JSON, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project = relationship("Project", backref="behavior_reports")
    test_run = relationship("TestRun", backref="behavior_reports")

