from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base

class PublicBenchmark(Base):
    """Model for industry benchmarks and public scorecards"""
    __tablename__ = "public_benchmarks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    version = Column(String(20), nullable=True)
    
    data = Column(JSON, nullable=False) # Benchmark dataset/results
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
