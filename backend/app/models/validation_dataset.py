"""
Validation Dataset model.

A dataset is a fixed set of inputs + config at save time, used as baseline
for Release Gate and "then vs now" comparison. Stores trace/snapshot refs,
eval config snapshot, and policy ruleset snapshot.
"""

import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ValidationDataset(Base):
    """Fixed inputs + config snapshot for validation baseline."""

    __tablename__ = "validation_datasets"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(String(100), nullable=True, index=True)

    # Refs: either trace_ids (list) or snapshot_ids (list)
    trace_ids = Column(JSON, nullable=True, comment="List of trace IDs in this dataset")
    snapshot_ids = Column(JSON, nullable=True, comment="List of snapshot IDs in this dataset")

    # Config snapshots at save time (no full payloads)
    eval_config_snapshot = Column(JSON, nullable=True, comment="Eval/diagnostic config version or snapshot")
    policy_ruleset_snapshot = Column(JSON, nullable=True, comment="Rule snapshot: [{id, revision, rule_json}, ...]")
    ruleset_hash = Column(String(64), nullable=True, index=True)

    label = Column(String(200), nullable=True, index=True)
    tag = Column(String(100), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project = relationship("Project", backref="validation_datasets")
