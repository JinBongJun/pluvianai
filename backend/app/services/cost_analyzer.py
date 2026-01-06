"""
Cost analysis service for LLM API usage.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.api_call import APICall
from app.models.alert import Alert


class CostAnalyzer:
    """Analyze and detect cost anomalies"""
    
    # Model pricing (per 1M tokens) - as of 2024
    PRICING = {
        "openai": {
            "gpt-4": {"input": 30.0, "output": 60.0},
            "gpt-4-turbo": {"input": 10.0, "output": 30.0},
            "gpt-4-32k": {"input": 60.0, "output": 120.0},
            "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
            "gpt-3.5-turbo-16k": {"input": 3.0, "output": 4.0},
        },
        "anthropic": {
            "claude-3-opus": {"input": 15.0, "output": 75.0},
            "claude-3-sonnet": {"input": 3.0, "output": 15.0},
            "claude-3-haiku": {"input": 0.25, "output": 1.25},
            "claude-2": {"input": 8.0, "output": 24.0},
        },
        "google": {
            "gemini-pro": {"input": 0.5, "output": 1.5},
            "gemini-ultra": {"input": 7.0, "output": 21.0},
        },
    }
    
    def __init__(self):
        self.anomaly_threshold = 3.0  # 3x increase triggers alert
    
    def calculate_cost(
        self,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int
    ) -> float:
        """
        Calculate cost for API call
        
        Args:
            provider: Provider name (openai, anthropic, google)
            model: Model name
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
        
        Returns:
            Cost in USD
        """
        provider_pricing = self.PRICING.get(provider, {})
        model_pricing = provider_pricing.get(model, {})
        
        if not model_pricing:
            # Default pricing if model not found
            input_price = 1.0
            output_price = 2.0
        else:
            input_price = model_pricing.get("input", 1.0)
            output_price = model_pricing.get("output", 2.0)
        
        # Calculate cost (pricing is per 1M tokens)
        input_cost = (input_tokens / 1_000_000) * input_price
        output_cost = (output_tokens / 1_000_000) * output_price
        
        return input_cost + output_cost
    
    def analyze_project_costs(
        self,
        project_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Analyze costs for a project
        
        Returns:
            Dictionary with cost analysis:
            - total_cost: float
            - by_model: Dict[str, float]
            - by_provider: Dict[str, float]
            - by_day: List[Dict]
            - average_daily_cost: float
        """
        if not db:
            raise ValueError("Database session required")
        
        if not end_date:
            end_date = datetime.utcnow()
        if not start_date:
            start_date = end_date - timedelta(days=7)
        
        # Get API calls
        api_calls = db.query(APICall).filter(
            and_(
                APICall.project_id == project_id,
                APICall.created_at >= start_date,
                APICall.created_at <= end_date
            )
        ).all()
        
        total_cost = 0.0
        by_model: Dict[str, float] = {}
        by_provider: Dict[str, float] = {}
        by_day: Dict[str, float] = {}
        
        for call in api_calls:
            input_tokens = call.request_tokens or 0
            output_tokens = call.response_tokens or 0
            
            cost = self.calculate_cost(
                call.provider,
                call.model,
                input_tokens,
                output_tokens
            )
            
            total_cost += cost
            
            # Aggregate by model
            model_key = f"{call.provider}/{call.model}"
            by_model[model_key] = by_model.get(model_key, 0.0) + cost
            
            # Aggregate by provider
            by_provider[call.provider] = by_provider.get(call.provider, 0.0) + cost
            
            # Aggregate by day
            day_key = call.created_at.date().isoformat()
            by_day[day_key] = by_day.get(day_key, 0.0) + cost
        
        # Calculate average daily cost
        days = (end_date - start_date).days or 1
        average_daily_cost = total_cost / days
        
        # Convert by_day to list
        by_day_list = [
            {"date": date, "cost": cost}
            for date, cost in sorted(by_day.items())
        ]
        
        return {
            "total_cost": total_cost,
            "by_model": by_model,
            "by_provider": by_provider,
            "by_day": by_day_list,
            "average_daily_cost": average_daily_cost,
            "period_start": start_date,
            "period_end": end_date,
        }
    
    def detect_cost_anomalies(
        self,
        project_id: int,
        db: Optional[Session] = None
    ) -> List[Alert]:
        """
        Detect cost anomalies (sudden spikes)
        
        Returns:
            List of Alert objects
        """
        if not db:
            raise ValueError("Database session required")
        
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)
        week_start = today_start - timedelta(days=7)
        
        # Calculate today's cost
        today_analysis = self.analyze_project_costs(
            project_id,
            start_date=today_start,
            end_date=now,
            db=db
        )
        today_cost = today_analysis["total_cost"]
        
        # Calculate yesterday's cost
        yesterday_analysis = self.analyze_project_costs(
            project_id,
            start_date=yesterday_start,
            end_date=today_start,
            db=db
        )
        yesterday_cost = yesterday_analysis["total_cost"]
        
        # Calculate weekly average
        week_analysis = self.analyze_project_costs(
            project_id,
            start_date=week_start,
            end_date=today_start,
            db=db
        )
        week_avg = week_analysis["average_daily_cost"]
        
        alerts = []
        
        # Check for spike compared to yesterday
        if yesterday_cost > 0:
            ratio = today_cost / yesterday_cost
            if ratio >= self.anomaly_threshold:
                alert = Alert(
                    project_id=project_id,
                    alert_type="cost_spike",
                    severity="high" if ratio >= 5.0 else "medium",
                    title=f"Cost spike detected: {ratio:.1f}x increase",
                    message=f"Today's cost (${today_cost:.2f}) is {ratio:.1f}x higher than yesterday (${yesterday_cost:.2f})",
                    alert_data={
                        "today_cost": today_cost,
                        "yesterday_cost": yesterday_cost,
                        "ratio": ratio,
                    },
                    notification_channels=["email", "slack"],
                )
                alerts.append(alert)
        
        # Check for spike compared to weekly average
        if week_avg > 0:
            ratio = today_cost / week_avg
            if ratio >= self.anomaly_threshold:
                alert = Alert(
                    project_id=project_id,
                    alert_type="cost_spike",
                    severity="critical" if ratio >= 5.0 else "high",
                    title=f"Cost spike detected: {ratio:.1f}x above weekly average",
                    message=f"Today's cost (${today_cost:.2f}) is {ratio:.1f}x higher than weekly average (${week_avg:.2f})",
                    alert_data={
                        "today_cost": today_cost,
                        "weekly_average": week_avg,
                        "ratio": ratio,
                    },
                    notification_channels=["email", "slack"],
                )
                alerts.append(alert)
        
        # Check for model-specific anomalies
        today_by_model = today_analysis["by_model"]
        week_by_model = week_analysis["by_model"]
        
        for model, today_model_cost in today_by_model.items():
            week_model_avg = week_by_model.get(model, 0.0) / 7  # Daily average
            if week_model_avg > 0:
                ratio = today_model_cost / week_model_avg
                if ratio >= self.anomaly_threshold:
                    alert = Alert(
                        project_id=project_id,
                        alert_type="cost_spike",
                        severity="high",
                        title=f"Model cost spike: {model}",
                        message=f"{model} cost today (${today_model_cost:.2f}) is {ratio:.1f}x higher than weekly average (${week_model_avg:.2f})",
                        alert_data={
                            "model": model,
                            "today_cost": today_model_cost,
                            "weekly_average": week_model_avg,
                            "ratio": ratio,
                        },
                        notification_channels=["email"],
                    )
                    alerts.append(alert)
        
        # Save alerts
        for alert in alerts:
            db.add(alert)
        db.commit()
        
        return alerts
    
    def compare_models(
        self,
        project_id: int,
        days: int = 7,
        db: Optional[Session] = None
    ) -> List[Dict[str, Any]]:
        """
        Compare costs across different models
        
        Returns:
            List of model comparison dictionaries
        """
        if not db:
            raise ValueError("Database session required")
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        analysis = self.analyze_project_costs(
            project_id,
            start_date=start_date,
            end_date=end_date,
            db=db
        )
        
        # Get API call counts per model
        api_calls = db.query(APICall).filter(
            and_(
                APICall.project_id == project_id,
                APICall.created_at >= start_date,
                APICall.created_at <= end_date
            )
        ).all()
        
        model_stats: Dict[str, Dict[str, Any]] = {}
        
        for call in api_calls:
            model_key = f"{call.provider}/{call.model}"
            if model_key not in model_stats:
                model_stats[model_key] = {
                    "model": model_key,
                    "provider": call.provider,
                    "model_name": call.model,
                    "total_cost": 0.0,
                    "total_calls": 0,
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                    "avg_latency": 0.0,
                }
            
            stats = model_stats[model_key]
            stats["total_calls"] += 1
            stats["total_input_tokens"] += call.request_tokens or 0
            stats["total_output_tokens"] += call.response_tokens or 0
            
            cost = self.calculate_cost(
                call.provider,
                call.model,
                call.request_tokens or 0,
                call.response_tokens or 0
            )
            stats["total_cost"] += cost
            
            if call.latency_ms:
                stats["avg_latency"] = (
                    (stats["avg_latency"] * (stats["total_calls"] - 1) + call.latency_ms) /
                    stats["total_calls"]
                )
        
        # Calculate cost per call
        for stats in model_stats.values():
            if stats["total_calls"] > 0:
                stats["cost_per_call"] = stats["total_cost"] / stats["total_calls"]
                stats["avg_latency"] = stats["avg_latency"] / stats["total_calls"] if stats["avg_latency"] > 0 else 0.0
        
        return list(model_stats.values())
