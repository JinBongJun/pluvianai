"""
Database connection and session management
"""
import json
import time
from pathlib import Path
from sqlalchemy import create_engine, text
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
    connect_args={
        "options": "-c timezone=utc"
    } if "postgresql" in settings.DATABASE_URL else {}
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Debug logging setup
LOG_PATH = Path("c:/Users/user/Desktop/AgentGuard/.cursor/debug.log")
SESSION_ID = "debug-session"
RUN_ID = "ci-repro"


def _agent_log(hypothesis_id: str, location: str, message: str, data: dict):
    payload = {
        "sessionId": SESSION_ID,
        "runId": RUN_ID,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception:
        # Logging must never break the app
        pass

# #region agent log
_agent_log("H1", "database.py:module", "module_imported", {"engine_url_prefix": settings.DATABASE_URL.split('@')[0] if settings.DATABASE_URL else "none"})
# #endregion


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
        # #region agent log
        _agent_log("H1", "database.py:check_database_health", "start", {})
        # #endregion
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        # #region agent log
        _agent_log("H1", "database.py:check_database_health", "success", {})
        # #endregion
        return True
    except Exception as exc:
        # #region agent log
        _agent_log("H1", "database.py:check_database_health", "fail", {"error": str(exc)})
        # #endregion
        return False
