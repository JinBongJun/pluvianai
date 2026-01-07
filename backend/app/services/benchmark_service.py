"""
Multi-model benchmarking service
"""
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.services.cost_analyzer import CostAnalyzer


class BenchmarkService:
    """Service for comparing and benchmarking different models"""
    
    def __init__(self):
        self.cost_analyzer = CostAnalyzer()
    
    def compare_models(
        self,
        project_id: int,
        days: int = 7,
        db: Optional[Session] = None
    ) -> List[Dict[str, Any]]:
        """
        Compare models across multiple dimensions
        
        Returns:
            List of model comparison dictionaries with:
            - model: str
            - provider: str
            - total_calls: int
            - avg_quality_score: float
            - total_cost: float
            - cost_per_call: float
            - avg_latency: float
            - success_rate: float
            - recommendation_score: float
        """
        if not db:
            raise ValueError("Database session required")
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get API calls
        api_calls = db.query(APICall).filter(
            and_(
                APICall.project_id == project_id,
                APICall.created_at >= start_date,
                APICall.created_at <= end_date
            )
        ).all()
        
        # Group by model
        model_stats: Dict[str, Dict[str, Any]] = {}
        
        for call in api_calls:
            model_key = f"{call.provider}/{call.model}"
            
            if model_key not in model_stats:
                model_stats[model_key] = {
                    "model": model_key,
                    "provider": call.provider,
                    "model_name": call.model,
                    "total_calls": 0,
                    "successful_calls": 0,
                    "total_cost": 0.0,
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                    "total_latency": 0.0,
                    "quality_scores": [],
                }
            
            stats = model_stats[model_key]
            stats["total_calls"] += 1
            
            # Check if successful
            if call.status_code and 200 <= call.status_code < 300:
                stats["successful_calls"] += 1
            
            # Calculate cost
            cost = self.cost_analyzer.calculate_cost(
                call.provider,
                call.model,
                call.request_tokens or 0,
                call.response_tokens or 0
            )
            stats["total_cost"] += cost
            
            stats["total_input_tokens"] += call.request_tokens or 0
            stats["total_output_tokens"] += call.response_tokens or 0
            
            if call.latency_ms:
                stats["total_latency"] += call.latency_ms
        
        # Get quality scores
        quality_scores = db.query(QualityScore).join(APICall).filter(
            and_(
                QualityScore.project_id == project_id,
                QualityScore.created_at >= start_date,
                QualityScore.created_at <= end_date
            )
        ).all()
        
        for score in quality_scores:
            # Find corresponding API call
            call = db.query(APICall).filter(APICall.id == score.api_call_id).first()
            if call:
                model_key = f"{call.provider}/{call.model}"
                if model_key in model_stats:
                    model_stats[model_key]["quality_scores"].append(score.overall_score)
        
        # Calculate metrics
        results = []
        for model_key, stats in model_stats.items():
            total_calls = stats["total_calls"]
            
            # Calculate averages
            avg_quality = (
                sum(stats["quality_scores"]) / len(stats["quality_scores"])
                if stats["quality_scores"] else 0.0
            )
            
            cost_per_call = (
                stats["total_cost"] / total_calls if total_calls > 0 else 0.0
            )
            
            avg_latency = (
                stats["total_latency"] / total_calls if total_calls > 0 else 0.0
            )
            
            success_rate = (
                stats["successful_calls"] / total_calls * 100
                if total_calls > 0 else 0.0
            )
            
            # Calculate recommendation score
            # Higher quality, lower cost, lower latency, higher success rate = better
            # Normalize each metric to 0-1 scale
            quality_norm = avg_quality / 100.0  # Already 0-100
            cost_norm = 1.0 / (1.0 + cost_per_call * 10)  # Inverse cost
            latency_norm = 1.0 / (1.0 + avg_latency / 1000)  # Inverse latency (ms to seconds)
            success_norm = success_rate / 100.0  # Already percentage
            
            # Weighted average
            recommendation_score = (
                quality_norm * 0.4 +
                cost_norm * 0.3 +
                latency_norm * 0.2 +
                success_norm * 0.1
            ) * 100
            
            results.append({
                "model": model_key,
                "provider": stats["provider"],
                "model_name": stats["model_name"],
                "total_calls": total_calls,
                "avg_quality_score": avg_quality,
                "total_cost": stats["total_cost"],
                "cost_per_call": cost_per_call,
                "avg_latency_ms": avg_latency,
                "success_rate": success_rate,
                "recommendation_score": recommendation_score,
            })
        
        # Sort by recommendation score
        results.sort(key=lambda x: x["recommendation_score"], reverse=True)
        
        return results
    
    def get_recommendations(
        self,
        project_id: int,
        days: int = 7,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Get model recommendations based on current usage
        
        Returns:
            Dictionary with recommendations
        """
        comparisons = self.compare_models(project_id, days, db)
        
        if not comparisons:
            return {
                "message": "No data available for recommendations",
                "recommendations": [],
            }
        
        # Get current primary model (most used)
        primary_model = comparisons[0]
        
        # Find better alternatives
        recommendations = []
        for model in comparisons[1:]:
            # Check if this model is better in key metrics
            improvements = []
            
            if model["avg_quality_score"] > primary_model["avg_quality_score"] * 1.1:
                improvements.append({
                    "metric": "quality",
                    "improvement": f"{(model['avg_quality_score'] / primary_model['avg_quality_score'] - 1) * 100:.1f}% better quality",
                })
            
            if model["cost_per_call"] < primary_model["cost_per_call"] * 0.7:
                savings = (1 - model["cost_per_call"] / primary_model["cost_per_call"]) * 100
                improvements.append({
                    "metric": "cost",
                    "improvement": f"{savings:.1f}% cost savings",
                })
            
            if model["avg_latency_ms"] < primary_model["avg_latency_ms"] * 0.8:
                speedup = (1 - model["avg_latency_ms"] / primary_model["avg_latency_ms"]) * 100
                improvements.append({
                    "metric": "latency",
                    "improvement": f"{speedup:.1f}% faster",
                })
            
            if improvements:
                recommendations.append({
                    "model": model["model"],
                    "recommendation_score": model["recommendation_score"],
                    "improvements": improvements,
                    "current_usage": primary_model["model"],
                })
        
        return {
            "current_primary_model": primary_model["model"],
            "recommendations": recommendations[:5],  # Top 5 recommendations
        }




