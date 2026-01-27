"""
Rule Market model for sharing firewall rules
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Float, Text, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class RuleMarket(Base):
    """Rule Market model for sharing firewall rules"""

    __tablename__ = "rule_market"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True)

    # Rule information
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    rule_type = Column(String(50), nullable=False, index=True)  # pii, toxicity, hallucination, custom
    pattern = Column(Text, nullable=False)
    pattern_type = Column(String(50), nullable=False)  # regex, keyword, ml

    # Metadata
    category = Column(String(100), nullable=True, index=True)  # security, quality, compliance
    tags = Column(JSON, default=[], nullable=False)  # ["pii", "gdpr", "email"]

    # Statistics
    download_count = Column(Integer, default=0, nullable=False)
    rating = Column(Float, default=0.0, nullable=False)  # Average rating (0-5)
    rating_count = Column(Integer, default=0, nullable=False)

    # Approval status
    is_approved = Column(Boolean, default=False, nullable=False, index=True)  # Admin approval required
    is_featured = Column(Boolean, default=False, nullable=False, index=True)  # Featured rule

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    author = relationship("User", foreign_keys=[author_id])

    # Indexes for common queries
    __table_args__ = (
        Index('ix_rule_market_category_approved', 'category', 'is_approved'),
        Index('ix_rule_market_featured_approved', 'is_featured', 'is_approved'),
    )
