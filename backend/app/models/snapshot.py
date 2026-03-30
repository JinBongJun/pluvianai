from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
    Text,
    Numeric,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Snapshot(Base):
    """Snapshot model for storing raw AI payloads for replay"""
    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    trace_id = Column(String(255), ForeignKey("traces.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(String(100), nullable=True, index=True)

    # Agent trajectory (chain/parallel metadata)
    parent_span_id = Column(String(255), nullable=True)
    span_order = Column(Integer, nullable=True)
    is_parallel = Column(Boolean, default=False, server_default="false")
    
    provider = Column(String(50), nullable=False)
    model = Column(String(100), nullable=False)
    model_settings = Column(JSON, nullable=True)

    # Structured prompt/response fields for Live View consumption
    system_prompt = Column(Text, nullable=True)
    user_message = Column(Text, nullable=True)
    response = Column(Text, nullable=True)

    # The "Frozen" payload (system prompt, user messages, tools, etc.)
    payload = Column(JSON, nullable=False)
    
    # Metrics and cost
    latency_ms = Column(Integer, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    cost = Column(Numeric(10, 6), nullable=True)

    # Signal detection results and Worst/Golden flags
    signal_result = Column(JSON, nullable=True)
    # Evaluated result based on project diagnostic_config (Passed/Failed status per metric)
    evaluation_result = Column(JSON, nullable=True)
    # Live View eval checks at save time (empty, latency, status_code, refusal, etc.) so display does not change when config changes
    eval_checks_result = Column(JSON, nullable=True)
    # Hash of eval config used when eval_checks_result was computed; used to show "config changed" in Release Gate baseline
    eval_config_version = Column(String(64), nullable=True)
    # Tool calls summary for display (e.g. [{"name": "get_weather", "arguments": "..."}])
    tool_calls_summary = Column(JSON, nullable=True)

    is_worst = Column(Boolean, default=False, server_default="false")
    worst_status = Column(String(20), nullable=True)
    is_golden = Column(Boolean, default=False, server_default="false")
    
    # Whether high-risk data (PII) has been masked
    is_sanitized = Column(Boolean, default=False, server_default="false")
    
    # Metadata for filtering (e.g., successful call or failure)
    status_code = Column(Integer, nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False, server_default="false", index=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        Index(
            "ix_snapshots_live_view_active_group",
            "project_id",
            "agent_id",
            "model",
            postgresql_where=is_deleted.is_(False),
            sqlite_where=is_deleted.is_(False),
        ),
    )

    # Relationships
    trace = relationship("Trace", back_populates="snapshots")
