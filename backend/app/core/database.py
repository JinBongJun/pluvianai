"""
Database connection and session management
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Create database engine with optimized connection pooling
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using
    pool_size=10,  # Base pool size
    max_overflow=20,  # Additional connections when needed
    pool_recycle=3600,  # Recycle connections after 1 hour
    pool_timeout=30,  # Timeout for getting connection
    echo=settings.DEBUG,  # Log SQL queries in debug mode
    # Optimize for JSONB queries
    connect_args={"options": "-c timezone=utc"} if "postgresql" in settings.DATABASE_URL else {},
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session
    Usage: db: Session = Depends(get_db)

    Automatically handles:
    - Connection acquisition from pool
    - Transaction rollback on exception
    - Connection cleanup
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()  # Commit if no exception occurred
    except Exception:
        db.rollback()  # Rollback on any exception
        raise
    finally:
        db.close()  # Always close connection


def check_database_health() -> bool:
    """
    Lightweight health check to verify DB connectivity.
    """
    try:
        with engine.connect() as connection:
            connection.execute("SELECT 1")
        return True
    except Exception:
        return False
