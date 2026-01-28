"""
Database connection and session management
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Create database engine with optimized connection pooling
from app.core.logging_config import logger

# Log DATABASE_URL (without password) for debugging
db_url_for_logging = settings.DATABASE_URL
if "@" in db_url_for_logging:
    # Mask password in logs
    parts = db_url_for_logging.split("@")
    if len(parts) == 2:
        auth_part = parts[0]
        if ":" in auth_part:
            user_part = auth_part.split(":")[0]
            db_url_for_logging = f"{user_part}:***@{parts[1]}"
logger.info(f"Database URL: {db_url_for_logging}")

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
    from sqlalchemy import text
    from app.core.logging_config import logger
    
    try:
        with engine.connect() as connection:
            # Use text() for SQLAlchemy 2.0 compatibility
            result = connection.execute(text("SELECT 1"))
            result.fetchone()  # Actually fetch the result
        return True
    except Exception as e:
        # Log the error for debugging
        logger.error(f"Database health check failed: {type(e).__name__}: {str(e)}")
        return False
