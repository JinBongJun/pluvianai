"""
Database connection and session management
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
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

# Create engine with connection retry and better error handling
try:
    connect_args = {}
    if "postgresql" in settings.DATABASE_URL:
        connect_args = {
            "options": "-c timezone=utc",
            "connect_timeout": 10,  # 10 second connection timeout
        }
    
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,  # Verify connections before using
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=3600,  # Recycle connections after 1 hour
        pool_timeout=settings.DB_POOL_TIMEOUT,
        echo=settings.DEBUG,  # Log SQL queries in debug mode
        connect_args=connect_args,
    )
    logger.info("Database engine created successfully")
except Exception as e:
    logger.error(f"Failed to create database engine: {type(e).__name__}: {str(e)}")
    raise

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
    from sqlalchemy.exc import OperationalError, SQLAlchemyError
    from app.core.logging_config import logger
    import traceback
    
    try:
        logger.debug("Attempting database health check...")
        with engine.connect() as connection:
            # Use text() for SQLAlchemy 2.0 compatibility
            result = connection.execute(text("SELECT 1"))
            result.fetchone()  # Actually fetch the result
        logger.debug("Database health check succeeded")
        return True
    except OperationalError as e:
        # Network/connection errors
        error_msg = str(e)
        logger.error(f"Database health check failed (OperationalError): {error_msg}")
        logger.error(f"Full error: {traceback.format_exc()}")
        return False
    except SQLAlchemyError as e:
        # Other SQLAlchemy errors
        error_msg = str(e)
        logger.error(f"Database health check failed (SQLAlchemyError): {error_msg}")
        logger.error(f"Full error: {traceback.format_exc()}")
        return False
    except Exception as e:
        # Any other errors
        error_msg = str(e)
        logger.error(f"Database health check failed (Unexpected): {type(e).__name__}: {error_msg}")
        logger.error(f"Full error: {traceback.format_exc()}")
        return False
