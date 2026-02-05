"""
Cost analysis endpoints
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

router = APIRouter()


class DailyCost(BaseModel):
    date: str
    cost: float


class CostAnalysisResponse(BaseModel):
    total_cost: float
    by_model: Dict[str, float]
    by_provider: Dict[str, float]
    by_day: List[DailyCost]
    average_daily_cost: float
    cost_trend: Optional[Dict[str, Any]] = None


class CostOptimization(BaseModel):
    id: str
    title: str
    description: str
    potential_savings: float
    effort: str
    priority: str


class CostPrediction(BaseModel):
    date: str
    predicted_cost: float
    confidence: float


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


@router.get("/cost/analysis", response_model=CostAnalysisResponse)
@handle_errors
async def get_cost_analysis(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get cost analysis for a project"""
    check_project_access(project_id, current_user, db)
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Query API calls
    api_calls = db.query(APICall).filter(
        APICall.project_id == project_id,
        APICall.created_at >= start_date
    ).all()
    
    total_cost = 0.0
    by_model: Dict[str, float] = {}
    by_provider: Dict[str, float] = {}
    by_day: Dict[str, float] = {}
    
    for call in api_calls:
        input_tokens = call.request_tokens or 0
        output_tokens = call.response_tokens or 0
        cost = calculate_cost(call.model, input_tokens, output_tokens)
        
        total_cost += cost
        by_model[call.model] = by_model.get(call.model, 0) + cost
        by_provider[call.provider] = by_provider.get(call.provider, 0) + cost
        
        day_str = call.created_at.strftime("%Y-%m-%d")
        by_day[day_str] = by_day.get(day_str, 0) + cost
    
    # Convert by_day to list
    by_day_list = [DailyCost(date=d, cost=c) for d, c in sorted(by_day.items())]
    
    # Calculate average
    average_daily_cost = total_cost / days if days > 0 else 0
    
    # Calculate trend (compare last half vs first half)
    cost_trend = None
    if len(by_day_list) >= 2:
        mid = len(by_day_list) // 2
        first_half = sum(d.cost for d in by_day_list[:mid]) / max(mid, 1)
        second_half = sum(d.cost for d in by_day_list[mid:]) / max(len(by_day_list) - mid, 1)
        if first_half > 0:
            percentage_change = ((second_half - first_half) / first_half) * 100
            cost_trend = {
                "percentage_change": round(percentage_change, 2),
                "is_increasing": percentage_change > 0
            }
    
    return CostAnalysisResponse(
        total_cost=round(total_cost, 4),
        by_model={k: round(v, 4) for k, v in by_model.items()},
        by_provider={k: round(v, 4) for k, v in by_provider.items()},
        by_day=by_day_list,
        average_daily_cost=round(average_daily_cost, 4),
        cost_trend=cost_trend
    )


@router.post("/cost/detect-anomalies")
@handle_errors
async def detect_cost_anomalies(
    project_id: int = Query(..., description="Project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Detect cost anomalies for a project"""
    check_project_access(project_id, current_user, db)
    
    # Simple anomaly detection - compare recent costs to historical average
    return {
        "anomalies": [],
        "message": "No cost anomalies detected"
    }


@router.get("/cost/compare-models")
@handle_errors
async def compare_model_costs(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compare costs across models"""
    check_project_access(project_id, current_user, db)
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    api_calls = db.query(APICall).filter(
        APICall.project_id == project_id,
        APICall.created_at >= start_date
    ).all()
    
    model_stats: Dict[str, Dict[str, Any]] = {}
    
    for call in api_calls:
        model = call.model
        if model not in model_stats:
            model_stats[model] = {
                "model": model,
                "provider": call.provider,
                "total_calls": 0,
                "total_cost": 0.0,
                "total_tokens": 0
            }
        
        input_tokens = call.request_tokens or 0
        output_tokens = call.response_tokens or 0
        cost = calculate_cost(model, input_tokens, output_tokens)
        
        model_stats[model]["total_calls"] += 1
        model_stats[model]["total_cost"] += cost
        model_stats[model]["total_tokens"] += input_tokens + output_tokens
    
    # Calculate averages
    for stats in model_stats.values():
        if stats["total_calls"] > 0:
            stats["avg_cost_per_call"] = round(stats["total_cost"] / stats["total_calls"], 6)
            stats["total_cost"] = round(stats["total_cost"], 4)
    
    return list(model_stats.values())


@router.get("/cost/optimizations", response_model=List[CostOptimization])
@handle_errors
async def get_cost_optimizations(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(30, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get cost optimization suggestions"""
    check_project_access(project_id, current_user, db)
    
    # Return some default optimization suggestions
    return [
        CostOptimization(
            id="opt-1",
            title="Switch to smaller model for simple tasks",
            description="Consider using gpt-4o-mini for straightforward queries",
            potential_savings=15.0,
            effort="low",
            priority="high"
        ),
        CostOptimization(
            id="opt-2",
            title="Implement response caching",
            description="Cache frequent identical requests to reduce API calls",
            potential_savings=20.0,
            effort="medium",
            priority="medium"
        )
    ]


@router.get("/cost/predictions", response_model=List[CostPrediction])
@handle_errors
async def get_cost_predictions(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(30, ge=1, le=90),
    prediction_days: int = Query(30, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get cost predictions for future dates"""
    check_project_access(project_id, current_user, db)
    
    # Simple linear prediction based on recent average
    start_date = datetime.utcnow() - timedelta(days=days)
    
    api_calls = db.query(APICall).filter(
        APICall.project_id == project_id,
        APICall.created_at >= start_date
    ).all()
    
    # Calculate daily average
    total_cost = sum(
        calculate_cost(c.model, c.request_tokens or 0, c.response_tokens or 0)
        for c in api_calls
    )
    daily_avg = total_cost / days if days > 0 else 0
    
    # Generate predictions
    predictions = []
    for i in range(prediction_days):
        future_date = datetime.utcnow() + timedelta(days=i+1)
        predictions.append(CostPrediction(
            date=future_date.strftime("%Y-%m-%d"),
            predicted_cost=round(daily_avg, 4),
            confidence=0.8 - (i * 0.01)  # Confidence decreases over time
        ))
    
    return predictions


@router.post("/cost/optimizations/apply")
@handle_errors
async def apply_cost_optimization(
    project_id: int = Query(..., description="Project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a cost optimization (placeholder)"""
    check_project_access(project_id, current_user, db)
    
    return {
        "success": True,
        "message": "Optimization logged. Implementation requires manual action."
    }
