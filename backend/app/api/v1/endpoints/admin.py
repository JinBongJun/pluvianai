"""
Admin endpoints for database initialization
⚠️ This endpoint should be removed or secured after initial deployment
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Literal, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_admin
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.models.user import User
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.models.drift_detection import DriftDetection
from app.models.alert import Alert
from app.services.ops_alerting import ops_alerting
import random

router = APIRouter()

# Include impersonation routes
from app.api.v1.endpoints.admin.impersonation import router as impersonation_router
router.include_router(impersonation_router, tags=["admin-impersonation"])


class OpsAlertDryRunRequest(BaseModel):
    event_type: Literal[
        "live_view_api_degraded",
        "project_api_degraded",
        "release_gate_failure_burst",
        "release_gate_fail_ratio_high",
        "provider_error_burst",
        "db_error_burst",
        "snapshot_error_ratio_high",
        "custom",
    ]
    project_id: int = Field(1, ge=1)
    repeats: int = Field(1, ge=1, le=250)
    status_code: int = Field(500, ge=100, le=599)
    duration_ms: float = Field(5000.0, ge=0)
    error_summary: str = ""
    error_class: str = "OperationalError"
    endpoint_group: Literal["live_view", "release_gate"] = "live_view"
    provider: Literal["openai", "anthropic", "google", "unknown"] = "openai"
    error_code: str = "provider_error"
    success: bool = Field(False)
    custom_severity: Literal["info", "warning", "critical"] = "warning"
    custom_title: Optional[str] = None
    custom_summary: Optional[str] = None


@router.post("/init-db", status_code=status.HTTP_201_CREATED)
@handle_errors
async def init_database(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Initialize database tables using Alembic migrations
    ⚠️ WARNING: This endpoint should be removed or secured after initial deployment
    ⚠️ DEPRECATED: Use 'alembic upgrade head' instead
    """
    require_admin(current_user)

    import subprocess
    import os

    # Use Alembic to run migrations instead of create_all
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    alembic_cmd = ["python", "-m", "alembic", "upgrade", "head"]

    try:
        result = subprocess.run(alembic_cmd, cwd=backend_dir, capture_output=True, text=True, check=True)
        logger.info("Database migrations applied successfully")
        return {
            "message": "Database initialized successfully using Alembic migrations",
            "method": "alembic upgrade head",
            "output": result.stdout,
        }
    except subprocess.CalledProcessError as e:
        logger.error(f"Migration failed: {e.stderr}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Migration failed: {e.stderr}")


@router.post("/generate-sample-data")
async def generate_sample_data(
    project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
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

    # Admin-only endpoint, then verify target project access.
    require_admin(current_user)

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Generate sample API calls with various scenarios
    providers = ["openai", "anthropic", "google"]
    models = {
        "openai": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
        "anthropic": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
        "google": ["gemini-pro", "gemini-ultra"],
    }

    agents = ["router", "parser", "summarizer", "classifier", "extractor", None]
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
                "messages": [{"role": "user", "content": f"Analyze this data: {random.randint(1000, 9999)}"}],
                "temperature": random.uniform(0.1, 0.9),
            },
            request_prompt=f"Analyze this data: {random.randint(1000, 9999)}",
            response_data={
                "choices": [
                    {
                        "message": {
                            "content": (
                                f"Based on the analysis, here are the key findings: "
                                f"{random.randint(1, 10)} insights."
                            )
                        }
                    }
                ],
                "model": model,
            },
            response_text=f"Based on the analysis, here are the key findings: {random.randint(1, 10)} insights.",
            request_tokens=random.randint(100, 500),
            response_tokens=random.randint(200, 1000),
            latency_ms=random.uniform(500, 3000),
            status_code=200,
            agent_name=random.choice(agents),
            created_at=created_at,
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
                "choices": [{"message": {"content": "Here's the data: name: John, age: 30"}}],  # Not valid JSON
            },
            response_text="Here's the data: name: John, age: 30",
            request_tokens=random.randint(50, 200),
            response_tokens=random.randint(50, 200),
            latency_ms=random.uniform(300, 2000),
            status_code=200,
            agent_name=random.choice(agents),
            created_at=created_at,
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
                created_at=api_call.created_at,
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
                "severity": "high",
            },
            {
                "type": "structure",
                "current": 0.85,
                "baseline": 0.95,
                "change": -10.5,
                "evidence": "JSON structure validity decreased from 95% to 85%",
                "severity": "medium",
            },
            {
                "type": "semantic",
                "current": 0.70,
                "baseline": 0.85,
                "change": -17.6,
                "evidence": "Semantic consistency dropped from 85% to 70%",
                "severity": "high",
            },
            {
                "type": "latency",
                "current": 3500,
                "baseline": 2000,
                "change": 75.0,
                "evidence": "Average latency increased from 2000ms to 3500ms",
                "severity": "critical",
            },
            {
                "type": "quality",
                "current": 75.0,
                "baseline": 88.0,
                "change": -14.8,
                "evidence": "Overall quality score decreased from 88 to 75",
                "severity": "high",
            },
        ]

        for scenario in drift_scenarios:
            detection = DriftDetection(
                project_id=project_id,
                detection_type=scenario["type"],
                model=random.choice(["gpt-4", "claude-3-opus", "gpt-3.5-turbo"]),
                current_value=scenario["current"],
                baseline_value=scenario["baseline"],
                change_percentage=scenario["change"],
                drift_score=abs(scenario["change"]) + random.uniform(0, 10),
                severity=scenario["severity"],
                detected_at=datetime.utcnow() - timedelta(days=random.randint(0, 3), hours=random.randint(0, 23)),
                metadata={"evidence": scenario["evidence"]},
            )
            db.add(detection)

        # Generate sample alerts with context
        alert_scenarios = [
            {
                "type": "drift",
                "severity": "high",
                "title": "Significant drift detected in response length",
                "message": (
                    "Average response length increased by 50% compared to baseline. "
                    "This may indicate model behavior changes."
                ),
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
                created_at=datetime.utcnow() - timedelta(days=random.randint(0, 2), hours=random.randint(0, 23)),
            )
            db.add(alert)

        # Commit handled automatically by get_db() dependency

        logger.info(f"Comprehensive sample data generated for project {project_id}")
        return {
            "message": "Sample data generated successfully",
            "summary": {"api_calls": 50, "quality_scores": 30, "drift_detections": 5, "alerts": 3},
            "scenarios": {"normal_calls": 30, "json_errors": 10, "server_errors": 5, "high_latency": 5},
        }


@router.post("/upgrade-user-subscription")
@handle_errors
async def upgrade_user_subscription(
    email: str,
    plan_type: str = "startup",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upgrade user subscription by email (for testing/admin purposes)
    ⚠️ WARNING: This endpoint should be secured or removed in production
    """
    require_admin(current_user)

    from app.services.subscription_service import SubscriptionService
    from app.core.subscription_limits import PLAN_PRICING

    if plan_type not in PLAN_PRICING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan type: {plan_type}. Must be one of: {', '.join(PLAN_PRICING.keys())}",
        )

    # Find user by email
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User with email {email} not found")

    # Upgrade subscription
    subscription_service = SubscriptionService(db)
    subscription = subscription_service.create_or_update_subscription(
        user_id=user.id, plan_type=plan_type, status="active", price_per_month=PLAN_PRICING[plan_type]
    )

    logger.info(f"Upgraded subscription for user {email} to {plan_type}")

    return {
        "message": f"Subscription upgraded to {plan_type}",
        "user_email": email,
        "plan_type": subscription.plan_type,
        "status": subscription.status,
        "price_per_month": subscription.price_per_month,
    }


@router.post("/ops-alerts/test", status_code=status.HTTP_202_ACCEPTED)
async def trigger_ops_alert_dry_run(
    body: OpsAlertDryRunRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Admin-only dry-run endpoint for operational alerts.
    Useful for validating webhook wiring and message format without real incidents.
    """
    require_admin(current_user)

    et = body.event_type
    if et == "live_view_api_degraded":
        for _ in range(body.repeats):
            ops_alerting.observe_live_view_agents_request(
                project_id=body.project_id,
                status_code=body.status_code,
                duration_ms=body.duration_ms,
            )
    elif et == "project_api_degraded":
        for _ in range(body.repeats):
            ops_alerting.observe_project_api_request(
                project_id=body.project_id,
                endpoint_group=body.endpoint_group,
                status_code=body.status_code,
                duration_ms=body.duration_ms,
            )
    elif et == "release_gate_failure_burst":
        for _ in range(body.repeats):
            ops_alerting.observe_release_gate_result(
                project_id=body.project_id,
                success=False,
                error_summary=body.error_summary or "dry-run release gate failure",
            )
    elif et == "release_gate_fail_ratio_high":
        for _ in range(body.repeats):
            ops_alerting.observe_release_gate_result(
                project_id=body.project_id,
                success=bool(body.success),
                error_summary=body.error_summary or "dry-run release gate ratio sample",
            )
    elif et == "provider_error_burst":
        for _ in range(body.repeats):
            ops_alerting.observe_provider_error(
                project_id=body.project_id,
                provider=body.provider,
                error_code=body.error_code,
                error_summary=body.error_summary or "dry-run provider error",
            )
    elif et == "db_error_burst":
        for _ in range(body.repeats):
            ops_alerting.observe_db_error(body.error_class or "OperationalError")
    elif et == "snapshot_error_ratio_high":
        for _ in range(body.repeats):
            ops_alerting.observe_snapshot_status(
                project_id=body.project_id,
                status_code=body.status_code,
            )
    else:
        ops_alerting.emit_test_alert(
            event_type="custom_dry_run",
            severity=body.custom_severity,
            title=body.custom_title or "Custom ops alert dry-run",
            summary=body.custom_summary or "Manual dry-run alert triggered by admin endpoint.",
            payload={
                "project_id": body.project_id,
                "repeats": body.repeats,
            },
        )

    logger.info(
        "Ops alert dry-run triggered",
        extra={
            "event_type": body.event_type,
            "project_id": body.project_id,
            "repeats": body.repeats,
            "admin_user_id": current_user.id,
        },
    )

    return {
        "accepted": True,
        "event_type": body.event_type,
        "project_id": body.project_id,
        "repeats": body.repeats,
        "note": "Dry-run signal emitted. Check ops webhook channel and backend logs.",
    }
