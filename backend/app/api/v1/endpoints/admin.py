"""
Admin endpoints for database initialization
⚠️ This endpoint should be removed or secured after initial deployment
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db, engine, Base
from app.core.logging_config import logger

router = APIRouter()


@router.post("/init-db", status_code=status.HTTP_201_CREATED)
async def init_database(db: Session = Depends(get_db)):
    """
    Initialize database tables
    ⚠️ WARNING: This endpoint should be removed or secured after initial deployment
    """
    try:
        # Import all models to ensure they are registered
        from app.models import (
            User, Project, ProjectMember, APIKey, APICall,
            QualityScore, DriftDetection, Alert, Subscription, Usage
        )
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        
        logger.info("Database tables created successfully")
        return {
            "message": "Database initialized successfully",
            "tables_created": [
                "users", "projects", "project_members", "api_keys",
                "api_calls", "quality_scores", "drift_detections", "alerts",
                "subscriptions", "usage"
            ]
        }
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize database: {str(e)}"
        )

