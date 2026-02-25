import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class BehaviorRule(Base):
    """Behavior validation rule definition."""

    __tablename__ = "behavior_rules"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(String(1000), nullable=True)

    # scope_type: project | agent | canvas
    scope_type = Column(String(30), nullable=False, default="project", server_default="project")
    scope_ref = Column(String(255), nullable=True)

    severity_default = Column(String(20), nullable=True)
    rule_json = Column(JSON, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true", index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", backref="behavior_rules")

