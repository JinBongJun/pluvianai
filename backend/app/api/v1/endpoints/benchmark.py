"""
Benchmark/Model comparison endpoints
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.models.user import User
from app.models.api_call import APICall
from app.models.quality_score import QualityScore

router = APIRouter()


# Pricing per 1K tokens (approximate)
MODEL_PRICING = {
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    "claude-3-opus": {"input": 0.015, "output": 0.075},
    "claude-3-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
    "claude-3-5-sonnet": {"input": 0.003, "output": 0.015},
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost for a single API call"""
    pricing = MODEL_PRICING.get(model, {"input": 0.001, "output": 0.002})
    input_cost = (input_tokens / 1000) * pricing["input"]
    output_cost = (output_tokens / 1000) * pricing["output"]
    return input_cost + output_cost


class ModelComparisonResponse(BaseModel):
    model: str
    provider: str
    model_name: str
    total_calls: int
    avg_quality_score: float
    total_cost: float
    cost_per_call: float
    avg_cost_per_call: float
    avg_latency_ms: float
    avg_latency: float
    success_rate: float
    recommendation_score: float
    recommendation: Optional[str] = None


class ModelRecommendation(BaseModel):
    model: str
    reason: str
    estimated_savings: Optional[float] = None
    quality_impact: Optional[str] = None


@router.get("/benchmark/compare", response_model=List[ModelComparisonResponse])
@handle_errors
async def compare_models(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compare model performance and costs"""
    check_project_access(project_id, current_user, db)
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get API calls with quality scores
    api_calls = db.query(APICall).filter(
        APICall.project_id == project_id,
        APICall.created_at >= start_date
    ).all()
    
    # Get quality scores
    quality_scores = db.query(QualityScore).filter(
        QualityScore.project_id == project_id,
        QualityScore.created_at >= start_date
    ).all()
    
    # Create lookup for quality scores by api_call_id
    quality_by_call: Dict[int, float] = {}
    for qs in quality_scores:
        quality_by_call[qs.api_call_id] = qs.overall_score
    
    # Aggregate by model
    model_stats: Dict[str, Dict[str, Any]] = {}
    
    for call in api_calls:
        model = call.model
        if model not in model_stats:
            model_stats[model] = {
                "model": model,
                "provider": call.provider,
                "total_calls": 0,
                "total_cost": 0.0,
                "total_latency": 0.0,
                "success_count": 0,
                "quality_scores": []
            }
        
        stats = model_stats[model]
        stats["total_calls"] += 1
        
        # Calculate cost
        input_tokens = call.request_tokens or 0
        output_tokens = call.response_tokens or 0
        cost = calculate_cost(model, input_tokens, output_tokens)
        stats["total_cost"] += cost
        
        # Add latency
        if call.latency_ms:
            stats["total_latency"] += call.latency_ms
        
        # Check success (status_code 200 or no error)
        if call.status_code is None or call.status_code == 200:
            stats["success_count"] += 1
        
        # Add quality score if available
        if call.id in quality_by_call:
            stats["quality_scores"].append(quality_by_call[call.id])
    
    # Calculate final metrics
    results = []
    for model, stats in model_stats.items():
        total_calls = stats["total_calls"]
        avg_quality = (
            sum(stats["quality_scores"]) / len(stats["quality_scores"])
            if stats["quality_scores"] else 0
        )
        avg_latency_ms = stats["total_latency"] / total_calls if total_calls > 0 else 0
        cost_per_call = stats["total_cost"] / total_calls if total_calls > 0 else 0
        success_rate = stats["success_count"] / total_calls if total_calls > 0 else 0
        
        # Calculate recommendation score (higher is better)
        # Weighted: quality (40%), cost efficiency (30%), reliability (30%)
        quality_factor = avg_quality / 100 if avg_quality else 0.5
        cost_factor = 1 - min(cost_per_call * 100, 1)  # Inverse of cost
        reliability_factor = success_rate
        
        recommendation_score = (
            quality_factor * 0.4 +
            cost_factor * 0.3 +
            reliability_factor * 0.3
        ) * 100
        
        results.append(ModelComparisonResponse(
            model=model,
            provider=stats["provider"],
            model_name=model,
            total_calls=total_calls,
            avg_quality_score=round(avg_quality, 2),
            total_cost=round(stats["total_cost"], 4),
            cost_per_call=round(cost_per_call, 6),
            avg_cost_per_call=round(cost_per_call, 6),
            avg_latency_ms=round(avg_latency_ms, 2),
            avg_latency=round(avg_latency_ms / 1000, 4),
            success_rate=round(success_rate * 100, 2),
            recommendation_score=round(recommendation_score, 2),
            recommendation=_get_recommendation(recommendation_score)
        ))
    
    # Sort by recommendation score (descending)
    results.sort(key=lambda x: x.recommendation_score, reverse=True)
    
    return results


def _get_recommendation(score: float) -> str:
    """Get recommendation text based on score"""
    if score >= 80:
        return "Highly Recommended"
    elif score >= 60:
        return "Recommended"
    elif score >= 40:
        return "Consider Alternatives"
    else:
        return "Not Recommended"


@router.get("/benchmark/recommendations", response_model=List[ModelRecommendation])
@handle_errors
async def get_recommendations(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get model recommendations based on usage patterns"""
    check_project_access(project_id, current_user, db)
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get model usage
    api_calls = db.query(APICall).filter(
        APICall.project_id == project_id,
        APICall.created_at >= start_date
    ).all()
    
    recommendations = []
    
    # Check for expensive model usage
    expensive_models = ["gpt-4", "gpt-4-turbo", "claude-3-opus"]
    expensive_usage = sum(1 for c in api_calls if c.model in expensive_models)
    
    if expensive_usage > 10:
        recommendations.append(ModelRecommendation(
            model="gpt-4o-mini",
            reason="Consider gpt-4o-mini for simple tasks to reduce costs",
            estimated_savings=20.0,
            quality_impact="minimal for simple queries"
        ))
    
    # Check for high latency
    high_latency_count = sum(1 for c in api_calls if (c.latency_ms or 0) > 5000)
    if high_latency_count > 5:
        recommendations.append(ModelRecommendation(
            model="claude-3-haiku",
            reason="Fast response times for time-sensitive applications",
            quality_impact="good for straightforward tasks"
        ))
    
    # Default recommendation if none
    if not recommendations:
        recommendations.append(ModelRecommendation(
            model="gpt-4o",
            reason="Balanced performance and cost for general use cases"
        ))
    
    return recommendations
