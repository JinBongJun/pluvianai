"""
Public Benchmark model for sharing benchmark results
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Float, Text, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class PublicBenchmark(Base):
    """Public Benchmark model for sharing benchmark results"""

    __tablename__ = "public_benchmarks"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Benchmark information
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    benchmark_type = Column(String(50), nullable=False, index=True)  # model_comparison, task_performance

    # Data (JSON)
    benchmark_data = Column(JSON, nullable=False)  # Model performance metrics
    test_cases_count = Column(Integer, default=0, nullable=False)

    # Metadata
    category = Column(String(100), nullable=True, index=True)  # nlp, code, translation
    tags = Column(JSON, default=[], nullable=False)  # ["gpt-4", "claude", "translation"]

    # Status
    is_featured = Column(Boolean, default=False, nullable=False, index=True)
    is_approved = Column(Boolean, default=False, nullable=False, index=True)  # Admin approval required

    # Statistics
    view_count = Column(Integer, default=0, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    author = relationship("User", foreign_keys=[author_id])

    # Indexes for common queries
    __table_args__ = (
        Index('ix_public_benchmark_category_approved', 'category', 'is_approved'),
        Index('ix_public_benchmark_featured_approved', 'is_featured', 'is_approved'),
    )
