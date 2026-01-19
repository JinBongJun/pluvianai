"""
Admin endpoints for database initialization
⚠️ This endpoint should be removed or secured after initial deployment
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.core.database import get_db, engine, Base
from app.core.security import get_current_user
from app.core.decorators import handle_errors
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
@handle_errors
async def init_database(db: Session = Depends(get_db)):
    """
    Initialize database tables
    ⚠️ WARNING: This endpoint should be removed or secured after initial deployment
    """
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


@router.post("/generate-sample-data")
async def generate_sample_data(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate comprehensive sample data for a project (for onboarding/demo)
    
    Generates:
    - 50 API calls with various scenarios (success, errors, JSON issues)
    - 30 quality scores
    - 5 drift detections with evidence
    - 3 alerts
    - Various agent types and models
    """
    from app.core.permissions import check_project_access
    
    # Verify project access
    project = check_project_access(project_id, current_user, db)
    
    try:
        # Generate sample API calls with various scenarios
        providers = ['openai', 'anthropic', 'google']
        models = {
            'openai': ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
            'anthropic': ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
            'google': ['gemini-pro', 'gemini-ultra']
        }
        
        agents = ['router', 'parser', 'summarizer', 'classifier', 'extractor', None]
        
        api_calls = []
        
        # Scenario 1: Normal successful calls (30 calls)
        for i in range(30):
            provider = random.choice(providers)
            model = random.choice(models[provider])
            days_ago = random.randint(0, 7)
            created_at = datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23))
            
            api_call = APICall(
                project_id=project_id,
                provider=provider,
                model=model,
                request_data={
                    "messages": [
                        {"role": "user", "content": f"Analyze this data: {random.randint(1000, 9999)}"}
                    ],
                    "temperature": random.uniform(0.1, 0.9),
                },
                request_prompt=f"Analyze this data: {random.randint(1000, 9999)}",
                response_data={
                    "choices": [{
                        "message": {
                            "content": f"Based on the analysis, here are the key findings: {random.randint(1, 10)} insights."
                        }
                    }],
                    "model": model,
                },
                response_text=f"Based on the analysis, here are the key findings: {random.randint(1, 10)} insights.",
                request_tokens=random.randint(100, 500),
                response_tokens=random.randint(200, 1000),
                latency_ms=random.uniform(500, 3000),
                status_code=200,
                agent_name=random.choice(agents),
                created_at=created_at
            )
            db.add(api_call)
            api_calls.append(api_call)
        
        # Scenario 2: JSON validation errors (10 calls)
        for i in range(10):
            provider = random.choice(providers)
            model = random.choice(models[provider])
            days_ago = random.randint(0, 7)
            created_at = datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23))
            
            # Invalid JSON response
            api_call = APICall(
                project_id=project_id,
                provider=provider,
                model=model,
                request_data={
                    "messages": [{"role": "user", "content": "Return JSON format: {name, age}"}],
                },
                request_prompt="Return JSON format: {name, age}",
                response_data={
                    "choices": [{
                        "message": {
                            "content": "Here's the data: name: John, age: 30"  # Not valid JSON
                        }
                    }],
                },
                response_text="Here's the data: name: John, age: 30",
                request_tokens=random.randint(50, 200),
                response_tokens=random.randint(50, 200),
                latency_ms=random.uniform(300, 2000),
                status_code=200,
                agent_name=random.choice(agents),
                created_at=created_at
            )
            db.add(api_call)
            api_calls.append(api_call)
        
        # Scenario 3: Server errors (5 calls)
        for i in range(5):
            provider = random.choice(providers)
            model = random.choice(models[provider])
            days_ago = random.randint(0, 7)
            created_at = datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23))
            
            api_call = APICall(
                project_id=project_id,
                provider=provider,
                model=model,
                request_data={
                    "messages": [{"role": "user", "content": "Process this request"}],
                },
                request_prompt="Process this request",
                response_data={"error": "Internal server error"},
                response_text="Internal server error",
                request_tokens=random.randint(50, 300),
                response_tokens=0,
                latency_ms=random.uniform(100, 500),
                status_code=500,
                error_message="Internal server error",
                agent_name=random.choice(agents),
                created_at=created_at
            )
            db.add(api_call)
            api_calls.append(api_call)
        
        # Scenario 4: High latency calls (5 calls)
        for i in range(5):
            provider = random.choice(providers)
            model = random.choice(models[provider])
            days_ago = random.randint(0, 7)
            created_at = datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23))
            
            api_call = APICall(
                project_id=project_id,
                provider=provider,
                model=model,
                request_data={
                    "messages": [{"role": "user", "content": "Generate a long analysis"}],
                },
                request_prompt="Generate a long analysis",
                response_data={
                    "choices": [{
                        "message": {
                            "content": "This is a comprehensive analysis with many details. " * 20
                        }
                    }],
                },
                response_text="This is a comprehensive analysis with many details. " * 20,
                request_tokens=random.randint(500, 2000),
                response_tokens=random.randint(1000, 4000),
                latency_ms=random.uniform(5000, 15000),  # High latency
                status_code=200,
                agent_name=random.choice(agents),
                created_at=created_at
            )
            db.add(api_call)
            api_calls.append(api_call)
        
        db.flush()
        
        # Generate quality scores with breakdown
        quality_scenarios = [
            {"overall": (70, 80), "json_valid": False, "reason": "Invalid JSON structure"},
            {"overall": (85, 95), "json_valid": True, "reason": "High quality response"},
            {"overall": (60, 70), "json_valid": True, "reason": "Low semantic consistency"},
        ]
        
        for i, api_call in enumerate(api_calls[:30]):
            scenario = quality_scenarios[i % len(quality_scenarios)]
            overall = random.uniform(*scenario["overall"])
            
            quality_score = QualityScore(
                project_id=project_id,
                api_call_id=api_call.id,
                overall_score=overall,
                json_valid=scenario.get("json_valid", True),
                semantic_consistency_score=random.uniform(overall - 10, overall + 5),
                tone_score=random.uniform(overall - 15, overall + 5),
                coherence_score=random.uniform(overall - 10, overall + 5),
                violations=[] if scenario.get("json_valid", True) else ["invalid_json"],
                created_at=api_call.created_at
            )
            db.add(quality_score)
        
        # Generate drift detections with evidence
        drift_scenarios = [
            {
                "type": "length",
                "current": 1200,
                "baseline": 800,
                "change": 50.0,
                "evidence": "Average response length increased from 800 to 1200 tokens",
                "severity": "high"
            },
            {
                "type": "structure",
                "current": 0.85,
                "baseline": 0.95,
                "change": -10.5,
                "evidence": "JSON structure validity decreased from 95% to 85%",
                "severity": "medium"
            },
            {
                "type": "semantic",
                "current": 0.70,
                "baseline": 0.85,
                "change": -17.6,
                "evidence": "Semantic consistency dropped from 85% to 70%",
                "severity": "high"
            },
            {
                "type": "latency",
                "current": 3500,
                "baseline": 2000,
                "change": 75.0,
                "evidence": "Average latency increased from 2000ms to 3500ms",
                "severity": "critical"
            },
            {
                "type": "quality",
                "current": 75.0,
                "baseline": 88.0,
                "change": -14.8,
                "evidence": "Overall quality score decreased from 88 to 75",
                "severity": "high"
            },
        ]
        
        for scenario in drift_scenarios:
            detection = DriftDetection(
                project_id=project_id,
                detection_type=scenario["type"],
                model=random.choice(['gpt-4', 'claude-3-opus', 'gpt-3.5-turbo']),
                current_value=scenario["current"],
                baseline_value=scenario["baseline"],
                change_percentage=scenario["change"],
                drift_score=abs(scenario["change"]) + random.uniform(0, 10),
                severity=scenario["severity"],
                detected_at=datetime.utcnow() - timedelta(days=random.randint(0, 3), hours=random.randint(0, 23)),
                metadata={"evidence": scenario["evidence"]}
            )
            db.add(detection)
        
        # Generate sample alerts with context
        alert_scenarios = [
            {
                "type": "drift",
                "severity": "high",
                "title": "Significant drift detected in response length",
                "message": "Average response length increased by 50% compared to baseline. This may indicate model behavior changes.",
            },
            {
                "type": "cost_spike",
                "severity": "medium",
                "title": "Cost spike detected",
                "message": "Today's cost ($45.20) is 3.2x higher than yesterday's cost ($14.10).",
            },
            {
                "type": "quality_drop",
                "severity": "high",
                "title": "Quality score dropped below threshold",
                "message": "Overall quality score decreased from 88 to 75 over the past 48 hours.",
            },
        ]
        
        for scenario in alert_scenarios:
            alert = Alert(
                project_id=project_id,
                alert_type=scenario["type"],
                severity=scenario["severity"],
                title=scenario["title"],
                message=scenario["message"],
                is_sent=False,
                is_resolved=random.choice([True, False]),
                created_at=datetime.utcnow() - timedelta(days=random.randint(0, 2), hours=random.randint(0, 23))
            )
            db.add(alert)
        
        db.commit()
        
        logger.info(f"Comprehensive sample data generated for project {project_id}")
        return {
            "message": "Sample data generated successfully",
            "summary": {
                "api_calls": 50,
                "quality_scores": 30,
                "drift_detections": 5,
                "alerts": 3
            },
            "scenarios": {
                "normal_calls": 30,
                "json_errors": 10,
                "server_errors": 5,
                "high_latency": 5
            }
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to generate sample data: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate sample data: {str(e)}"
        )


@router.post("/upgrade-user-subscription")
@handle_errors
async def upgrade_user_subscription(
    email: str,
    plan_type: str = "startup",
    db: Session = Depends(get_db)
):
    """
    Upgrade user subscription by email (for testing/admin purposes)
    ⚠️ WARNING: This endpoint should be secured or removed in production
    """
    from app.models.subscription import Subscription
    from app.services.subscription_service import SubscriptionService
    from app.core.subscription_limits import PLAN_PRICING
    
    if plan_type not in PLAN_PRICING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan type: {plan_type}. Must be one of: {', '.join(PLAN_PRICING.keys())}"
        )
    
    # Find user by email
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with email {email} not found"
        )
    
    # Upgrade subscription
    subscription_service = SubscriptionService(db)
    subscription = subscription_service.create_or_update_subscription(
        user_id=user.id,
        plan_type=plan_type,
        status="active",
        price_per_month=PLAN_PRICING[plan_type]
    )
    
    logger.info(f"Upgraded subscription for user {email} to {plan_type}")
    
    return {
        "message": f"Subscription upgraded to {plan_type}",
        "user_email": email,
        "plan_type": subscription.plan_type,
        "status": subscription.status,
        "price_per_month": subscription.price_per_month
    }

