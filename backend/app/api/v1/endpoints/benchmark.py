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


@router.get("/compare", response_model=List[ModelComparisonResponse])
async def compare_models(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compare models across multiple dimensions"""
    # Verify project access (any member can view benchmarks)
    check_project_access(project_id, current_user, db)

    # Compare models (subscription check removed - available to all users)
    comparisons = benchmark_service.compare_models(project_id=project_id, days=days, db=db)

    # Ensure all required fields are present
    for comp in comparisons:
        if "recommendation" not in comp:
            comp["recommendation"] = None

    return comparisons


@router.get("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get model recommendations based on current usage"""
    # Verify project access (any member can view benchmarks)
    check_project_access(project_id, current_user, db)

    # Get recommendations
    recommendations = benchmark_service.get_recommendations(project_id=project_id, days=days, db=db)

    return recommendations
