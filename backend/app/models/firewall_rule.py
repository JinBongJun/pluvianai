from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base

class FirewallRuleType(str, enum.Enum):
    PII = "pii"
    TOXICITY = "toxicity"
    HALLUCINATION = "hallucination"
    CUSTOM = "custom"

class FirewallAction(str, enum.Enum):
    BLOCK = "block"
    FLAG = "flag"
    BYPASS = "bypass"

class FirewallSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class FirewallRule(Base):
    """Model for reactive firewall rules (Global/Project level)"""
    __tablename__ = "firewall_rules"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    name = Column(String(100), nullable=False)
    rule_type = Column(Enum(FirewallRuleType), nullable=False, default=FirewallRuleType.CUSTOM)
    action = Column(Enum(FirewallAction), default=FirewallAction.BLOCK)
    severity = Column(Enum(FirewallSeverity), default=FirewallSeverity.MEDIUM)
    
    pattern = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, server_default="true")
    priority = Column(Integer, default=100)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="firewall_rules")
