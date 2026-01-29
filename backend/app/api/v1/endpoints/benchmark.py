"""
Benchmark endpoints
"""

from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.feature_access import check_feature_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.services.benchmark_service import BenchmarkService

router = APIRouter()

benchmark_service = BenchmarkService()


class ModelComparisonResponse(BaseModel):
    """Model comparison response schema"""

    model: str
    provider: str
    model_name: str
    total_calls: int
    avg_quality_score: float
    total_cost: float
    cost_per_call: float
    avg_latency_ms: float
    success_rate: float
    recommendation_score: float
    recommendation: str | None = None  # Optional recommendation text


class RecommendationResponse(BaseModel):
    """Recommendation response schema"""

    current_primary_model: str
    recommendations: List[dict]


@router.get("/compare")
@handle_errors
async def compare_models(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Compare models across multiple dimensions
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        f"User {current_user.id} requested model comparison for project {project_id} (days: {days})",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )
    
    # Verify project access (any member can view benchmarks)
    check_project_access(project_id, current_user, db)
    
    # Check feature access: multi_model_comparison requires Startup+ plan
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="multi_model_comparison",
        required_plan="startup",
        message="Multi-model comparison requires Startup plan or higher. Upgrade to compare models across providers."
    )

    # Compare models
    comparisons = benchmark_service.compare_models(project_id=project_id, days=days, db=db)

    # Ensure all required fields are present
    for comp in comparisons:
        if "recommendation" not in comp:
            comp["recommendation"] = None

    logger.info(
        f"Model comparison completed for project {project_id}: {len(comparisons)} models compared",
        extra={"user_id": current_user.id, "project_id": project_id, "model_count": len(comparisons)}
    )

    # Return using standard response format
    return success_response(data=comparisons)


@router.get("/recommendations")
@handle_errors
async def get_recommendations(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get model recommendations based on current usage
    Following API_REFERENCE.md: Returns standard response format
    """
    logger.info(
        f"User {current_user.id} requested model recommendations for project {project_id} (days: {days})",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )
    
    # Verify project access (any member can view benchmarks)
    check_project_access(project_id, current_user, db)
    
    # Check feature access: model recommendations require Startup+ plan
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="model_optimization_advisor",
        required_plan="startup",
        message="Model optimization recommendations require Startup plan or higher. Upgrade for AI-powered model selection advice."
    )

    # Get recommendations
    recommendations = benchmark_service.get_recommendations(project_id=project_id, days=days, db=db)

    logger.info(
        f"Model recommendations generated for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id}
    )

    # Return using standard response format
    return success_response(data=recommendations)
