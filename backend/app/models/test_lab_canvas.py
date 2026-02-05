import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class TestLabCanvas(Base):
    """Stored Test Lab canvas (boxes + connections)."""

    __tablename__ = "test_lab_canvases"

    id = Column(String(255), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)

    boxes = Column(JSON, nullable=True)  # List[TestLabBox]
    connections = Column(JSON, nullable=True)  # List[TestLabEdge]

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
