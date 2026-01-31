"""
Review model for Human-in-the-loop workflow
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class ReviewStatus(str, enum.Enum):
    """Review status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_DISCUSSION = "needs_discussion"


class RegressionStatus(str, enum.Enum):
    """Regression status - the final verdict"""
    SAFE = "safe"
    REGRESSED = "regressed"
    CRITICAL = "critical"
    PENDING = "pending"


class Review(Base):
    """Review model - Human-in-the-loop review for deployments"""
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Review target
    replay_id = Column(Integer, nullable=True, index=True)  # Which replay this reviews
    
    # Review information
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Status
    status = Column(String(20), default="pending", index=True)  # pending/approved/rejected/needs_discussion
    regression_status = Column(String(20), default="pending", index=True)  # safe/regressed/critical/pending
    
    # Signal summary
    signals_detected = Column(JSON, nullable=True)  # Summary of detected signals
    affected_cases = Column(Integer, default=0)  # Number of affected cases
    
    # Reviewer information
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Decision
    decision = Column(String(50), nullable=True)  # approve_deploy/reject_deploy/rollback
    decision_note = Column(Text, nullable=True)
    
    # Metadata
    model_before = Column(String(100), nullable=True)
    model_after = Column(String(100), nullable=True)
    test_count = Column(Integer, default=0)
    passed_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", backref="reviews")
    reviewer = relationship("User", backref="reviews")
    comments = relationship("ReviewComment", back_populates="review")


class ReviewComment(Base):
    """Review Comment - comments on a review"""
    __tablename__ = "review_comments"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Comment content
    content = Column(Text, nullable=False)
    
    # Metadata
    is_system = Column(Boolean, default=False)  # System-generated comment
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    review = relationship("Review", back_populates="comments")
    user = relationship("User")


class ReviewCase(Base):
    """Review Case - individual test cases in a review"""
    __tablename__ = "review_cases"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Case information
    prompt = Column(Text, nullable=False)
    response_before = Column(Text, nullable=True)
    response_after = Column(Text, nullable=True)
    
    # Signals detected
    signals = Column(JSON, nullable=True)
    
    # Status
    status = Column(String(20), default="pending")  # pending/passed/failed/flagged
    
    # Manual override
    manually_reviewed = Column(Boolean, default=False)
    manual_status = Column(String(20), nullable=True)
    reviewer_note = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    review = relationship("Review")
