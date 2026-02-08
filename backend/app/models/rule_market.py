from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class RuleMarket(Base):
    """Model for shared/community firewall and signal rules"""
    __tablename__ = "rule_market"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    rule_type = Column(String(50), nullable=False)
    
    config_json = Column(Text, nullable=False) # JSON implementation of the rule
    author = Column(String(100), nullable=True)
    
    downloads = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
