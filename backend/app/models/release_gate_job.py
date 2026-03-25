import uuid
from sqlalchemy import Column, String, Integer, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class ReleaseGateJob(Base):
    __tablename__ = "release_gate_jobs"

    id = Column(String(255), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)

    # queued | running | succeeded | failed | canceled
    status = Column(String(20), nullable=False, index=True, default="queued")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    cancel_requested_at = Column(DateTime(timezone=True), nullable=True)

    progress_done = Column(Integer, nullable=False, default=0)
    progress_total = Column(Integer, nullable=True)
    progress_phase = Column(String(50), nullable=True)

    request_json = Column(JSON, nullable=False)
    report_id = Column(String(255), nullable=True, index=True)
    result_json = Column(JSON, nullable=True)
    error_detail = Column(JSON, nullable=True)

    locked_at = Column(DateTime(timezone=True), nullable=True)
    locked_by = Column(String(255), nullable=True)
    lease_expires_at = Column(DateTime(timezone=True), nullable=True)

