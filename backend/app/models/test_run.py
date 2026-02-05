import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class TestRun(Base):
    """Test execution session (single/chain)"""

    __tablename__ = "test_runs"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(200), nullable=False)
    test_type = Column(String(50), nullable=False)  # single/chain
    agent_config = Column(JSON, nullable=True)
    signal_config = Column(JSON, nullable=True)

    total_count = Column(Integer, default=0)
    pass_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)

    # Basic lifecycle status for concurrency limits and UX
    # Values: "running" | "completed" | "failed"
    status = Column(String(20), nullable=False, default="running")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
