"""
Admin endpoints for database initialization
⚠️ This endpoint should be removed or secured after initial deployment
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.core.database import get_db, engine, Base
from app.core.security import get_current_user
from app.core.logging_config import logger
from app.models.user import User
from app.models.project import Project
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.models.drift_detection import DriftDetection
from app.models.alert import Alert
import random

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
            QualityScore, DriftDetection, Alert, Subscription, Usage, ActivityLog, Webhook
        )
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        
        logger.info("Database tables created successfully")
        return {
            "message": "Database initialized successfully",
            "tables_created": [
                "users", "projects", "project_members", "api_keys",
                "api_calls", "quality_scores", "drift_detections", "alerts",
                "subscriptions", "usage", "activity_logs", "webhooks"
            ]
        }
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize database: {str(e)}"
        )


@router.post("/generate-sample-data")
async def generate_sample_data(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate sample data for a project (for onboarding/demo)"""
    from app.core.permissions import check_project_access
    
    # Verify project access
    project = check_project_access(project_id, current_user, db)
    
    try:
        # Generate sample API calls
        providers = ['openai', 'anthropic', 'google']
        models = {
            'openai': ['gpt-4', 'gpt-3.5-turbo'],
            'anthropic': ['claude-3-opus', 'claude-3-sonnet'],
            'google': ['gemini-pro', 'gemini-ultra']
        }
        
        api_calls = []
        for i in range(50):
            provider = random.choice(providers)
            model = random.choice(models[provider])
            created_at = datetime.utcnow() - timedelta(days=random.randint(0, 7))
            
            api_call = APICall(
                project_id=project_id,
                provider=provider,
                model=model,
                request_data={"messages": [{"role": "user", "content": f"Sample request {i}"}]},
                response_data={"choices": [{"message": {"content": f"Sample response {i}"}}]},
                request_tokens=random.randint(100, 500),
                response_tokens=random.randint(200, 1000),
                latency_ms=random.uniform(500, 3000),
                status_code=random.choice([200, 200, 200, 200, 500]),  # Mostly success
                agent_name=random.choice([None, 'router', 'parser', 'summarizer']),
                created_at=created_at
            )
            db.add(api_call)
            api_calls.append(api_call)
        
        db.flush()
        
        # Generate sample quality scores
        for api_call in api_calls[:30]:  # First 30 calls
            quality_score = QualityScore(
                project_id=project_id,
                api_call_id=api_call.id,
                overall_score=random.uniform(70, 95),
                semantic_consistency_score=random.uniform(75, 95),
                tone_score=random.uniform(70, 90),
                coherence_score=random.uniform(75, 95),
                created_at=api_call.created_at
            )
            db.add(quality_score)
        
        # Generate sample drift detections
        for i in range(5):
            detection = DriftDetection(
                project_id=project_id,
                detection_type=random.choice(['length', 'structure', 'semantic']),
                model=random.choice(['gpt-4', 'claude-3-opus']),
                current_value=random.uniform(50, 100),
                baseline_value=random.uniform(40, 80),
                change_percentage=random.uniform(-30, 50),
                drift_score=random.uniform(30, 80),
                severity=random.choice(['low', 'medium', 'high']),
                detected_at=datetime.utcnow() - timedelta(days=random.randint(0, 3))
            )
            db.add(detection)
        
        # Generate sample alerts
        for i in range(3):
            alert = Alert(
                project_id=project_id,
                alert_type=random.choice(['drift', 'cost_spike', 'quality_drop']),
                severity=random.choice(['medium', 'high']),
                title=f"Sample Alert {i+1}",
                message=f"This is a sample alert for demonstration purposes.",
                is_sent=False,
                is_resolved=random.choice([True, False]),
                created_at=datetime.utcnow() - timedelta(days=random.randint(0, 2))
            )
            db.add(alert)
        
        db.commit()
        
        logger.info(f"Sample data generated for project {project_id}")
        return {
            "message": "Sample data generated successfully",
            "api_calls": 50,
            "quality_scores": 30,
            "drift_detections": 5,
            "alerts": 3
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to generate sample data: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate sample data: {str(e)}"
        )

