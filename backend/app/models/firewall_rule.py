"""
Firewall Rule model for Production Guard
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class FirewallRuleType(str, enum.Enum):
    """Firewall rule types"""
    PII = "pii"  # Personally Identifiable Information
    TOXICITY = "toxicity"  # Toxic content
    HALLUCINATION = "hallucination"  # Hallucination detection
    CUSTOM = "custom"  # Custom pattern matching


class FirewallAction(str, enum.Enum):
    """Firewall actions"""
    BLOCK = "block"  # Block the response
    WARN = "warn"  # Log warning but allow
    LOG = "log"  # Log only


class FirewallSeverity(str, enum.Enum):
    """Firewall severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FirewallRule(Base):
    """Firewall rule for blocking dangerous responses"""

    __tablename__ = "firewall_rules"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Rule configuration
    rule_type = Column(SQLEnum(FirewallRuleType), nullable=False, index=True)
    name = Column(String(255), nullable=False)  # Human-readable rule name
    description = Column(Text, nullable=True)  # Rule description
    
    # Pattern matching
    pattern = Column(Text, nullable=True)  # Regex pattern or keyword
    pattern_type = Column(String(50), nullable=True)  # "regex", "keyword", "llm"
    
    # Action and severity
    action = Column(SQLEnum(FirewallAction), nullable=False, default=FirewallAction.BLOCK)
    severity = Column(SQLEnum(FirewallSeverity), nullable=False, default=FirewallSeverity.MEDIUM)
    
    # Rule state
    enabled = Column(Boolean, default=True, nullable=False, index=True)
    
    # Additional configuration (JSON)
    config = Column(JSON, nullable=True)  # Additional rule-specific config
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="firewall_rules")
