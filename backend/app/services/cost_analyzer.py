"""
Cost analysis service for LLM API usage.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.api_call import APICall
from app.models.alert import Alert
from app.services.pricing_updater import pricing_updater
from app.core.logging_config import logger


class CostAnalyzer:
    """Analyze and detect cost anomalies"""

    def __init__(self):
        self.anomaly_threshold = 3.0  # 3x increase triggers alert
        self.pricing_updater = pricing_updater

    @property
    def PRICING(self):
        """Get current pricing from PricingUpdater"""
        try:
            pricing = self.pricing_updater.get_pricing()
            if not pricing:
                # Fallback to base pricing if get_pricing returns None
                from app.services.pricing_updater import PricingUpdater
                return PricingUpdater.BASE_PRICING
            return pricing
        except Exception as e:
            # Fallback to base pricing if get_pricing fails
            from app.services.pricing_updater import PricingUpdater
            logger.warning(f"Failed to get pricing from updater: {str(e)}, using base pricing", exc_info=True)
            return PricingUpdater.BASE_PRICING

    def calculate_cost(self, provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
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
            # Try to get default pricing for provider
            provider_default = self.PRICING.get(provider, {}).get("default", {})
            if provider_default:
                input_price = provider_default.get("input", 1.0)
                output_price = provider_default.get("output", 2.0)
            else:
                # Final fallback: use unknown provider default
                unknown_default = self.PRICING.get("unknown", {}).get("default", {})
                input_price = unknown_default.get("input", 1.0)
                output_price = unknown_default.get("output", 2.0)
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
        db: Optional[Session] = None,
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
        api_calls = (
            db.query(APICall)
            .filter(
                and_(APICall.project_id == project_id, APICall.created_at >= start_date, APICall.created_at <= end_date)
            )
            .all()
        )

        total_cost = 0.0
        by_model: Dict[str, float] = {}
        by_provider: Dict[str, float] = {}
        by_day: Dict[str, float] = {}

        for call in api_calls:
            input_tokens = call.request_tokens or 0
            output_tokens = call.response_tokens or 0

            cost = self.calculate_cost(call.provider, call.model, input_tokens, output_tokens)

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
        by_day_list = [{"date": date, "cost": cost} for date, cost in sorted(by_day.items())]

        return {
            "total_cost": total_cost,
            "by_model": by_model,
            "by_provider": by_provider,
            "by_day": by_day_list,
            "average_daily_cost": average_daily_cost,
            "period_start": start_date,
            "period_end": end_date,
        }

    def detect_cost_anomalies(self, project_id: int, db: Optional[Session] = None) -> List[Alert]:
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
        today_analysis = self.analyze_project_costs(project_id, start_date=today_start, end_date=now, db=db)
        today_cost = today_analysis["total_cost"]

        # Calculate yesterday's cost
        yesterday_analysis = self.analyze_project_costs(
            project_id, start_date=yesterday_start, end_date=today_start, db=db
        )
        yesterday_cost = yesterday_analysis["total_cost"]

        # Calculate weekly average
        week_analysis = self.analyze_project_costs(project_id, start_date=week_start, end_date=today_start, db=db)
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

        # Save alerts (alert sending and webhook triggering handled by API endpoint)
        for alert in alerts:
            db.add(alert)

        db.commit()

        return alerts

    def compare_models(self, project_id: int, days: int = 7, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """
        Compare costs across different models

        Returns:
            List of model comparison dictionaries
        """
        if not db:
            raise ValueError("Database session required")

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        analysis = self.analyze_project_costs(project_id, start_date=start_date, end_date=end_date, db=db)

        # Get API call counts per model
        api_calls = (
            db.query(APICall)
            .filter(
                and_(APICall.project_id == project_id, APICall.created_at >= start_date, APICall.created_at <= end_date)
            )
            .all()
        )

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

            cost = self.calculate_cost(call.provider, call.model, call.request_tokens or 0, call.response_tokens or 0)
            stats["total_cost"] += cost

            if call.latency_ms:
                stats["avg_latency"] = (stats["avg_latency"] * (stats["total_calls"] - 1) + call.latency_ms) / stats[
                    "total_calls"
                ]

        # Calculate cost per call
        for stats in model_stats.values():
            if stats["total_calls"] > 0:
                stats["cost_per_call"] = stats["total_cost"] / stats["total_calls"]
                stats["avg_latency"] = stats["avg_latency"] / stats["total_calls"] if stats["avg_latency"] > 0 else 0.0

        return list(model_stats.values())

    def recommend_optimal_model_for_task(
        self, project_id: int, agent_name: Optional[str] = None, days: int = 7, db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Recommend optimal model for a specific task/agent based on cost, speed, and quality

        Args:
            project_id: Project ID
            agent_name: Optional agent name to filter by task type
            days: Number of days to analyze
            db: Database session

        Returns:
            Dictionary with recommendation:
            - recommended_model: str
            - current_model: str (if agent_name provided)
            - cost_savings: float (percentage)
            - quality_improvement: float (percentage)
            - speed_improvement: float (percentage)
            - roi_estimate: float (estimated monthly savings)
        """
        if not db:
            raise ValueError("Database session required")

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Build query
        query = db.query(APICall).filter(
            and_(APICall.project_id == project_id, APICall.created_at >= start_date, APICall.created_at <= end_date)
        )

        if agent_name:
            query = query.filter(APICall.agent_name == agent_name)

        api_calls = query.all()

        if not api_calls:
            return {
                "message": "No data available for recommendations",
                "recommended_model": None,
            }

        # Group by model and calculate metrics
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
                    "total_latency": 0.0,
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                }

            stats = model_stats[model_key]
            stats["total_calls"] += 1

            if call.status_code and 200 <= call.status_code < 300:
                stats["successful_calls"] += 1

            cost = self.calculate_cost(call.provider, call.model, call.request_tokens or 0, call.response_tokens or 0)
            stats["total_cost"] += cost
            stats["total_input_tokens"] += call.request_tokens or 0
            stats["total_output_tokens"] += call.response_tokens or 0

            if call.latency_ms:
                stats["total_latency"] += call.latency_ms

        # Get quality scores for each model
        from app.models.quality_score import QualityScore

        quality_scores = (
            db.query(QualityScore)
            .join(APICall)
            .filter(
                and_(
                    QualityScore.project_id == project_id,
                    QualityScore.created_at >= start_date,
                    QualityScore.created_at <= end_date,
                )
            )
            .all()
        )

        for score in quality_scores:
            call = db.query(APICall).filter(APICall.id == score.api_call_id).first()
            if call:
                model_key = f"{call.provider}/{call.model}"
                if model_key in model_stats:
                    if "quality_scores" not in model_stats[model_key]:
                        model_stats[model_key]["quality_scores"] = []
                    model_stats[model_key]["quality_scores"].append(score.overall_score)

        # Calculate composite scores for each model
        model_scores = []
        for model_key, stats in model_stats.items():
            total_calls = stats["total_calls"]

            # Calculate averages
            avg_cost_per_call = stats["total_cost"] / total_calls if total_calls > 0 else 0.0
            avg_latency = stats["total_latency"] / total_calls if total_calls > 0 else 0.0
            success_rate = (stats["successful_calls"] / total_calls * 100) if total_calls > 0 else 0.0
            avg_quality = (
                sum(stats.get("quality_scores", [])) / len(stats["quality_scores"])
                if stats.get("quality_scores")
                else 50.0
            )

            # Normalize metrics (0-1 scale, higher is better)
            # Cost: inverse (lower is better)
            cost_score = 1.0 / (1.0 + avg_cost_per_call * 100)

            # Latency: inverse (lower is better)
            latency_score = 1.0 / (1.0 + avg_latency / 1000)

            # Quality: direct (higher is better, already 0-100)
            quality_score = avg_quality / 100.0

            # Success rate: direct (higher is better, already percentage)
            success_score = success_rate / 100.0

            # Composite score (weighted)
            # For cost optimization: cost 40%, quality 30%, latency 20%, success 10%
            composite_score = cost_score * 0.4 + quality_score * 0.3 + latency_score * 0.2 + success_score * 0.1

            model_scores.append(
                {
                    "model": model_key,
                    "provider": stats["provider"],
                    "model_name": stats["model_name"],
                    "composite_score": composite_score,
                    "avg_cost_per_call": avg_cost_per_call,
                    "avg_latency_ms": avg_latency,
                    "avg_quality": avg_quality,
                    "success_rate": success_rate,
                    "total_calls": total_calls,
                }
            )

        # Sort by composite score
        model_scores.sort(key=lambda x: x["composite_score"], reverse=True)

        if not model_scores:
            return {
                "message": "No models available for comparison",
                "recommended_model": None,
            }

        recommended = model_scores[0]

        # Find current model if agent_name provided
        current_model = None
        if agent_name:
            # Find most used model for this agent
            agent_calls = [c for c in api_calls if c.agent_name == agent_name]
            if agent_calls:
                from collections import Counter

                model_counts = Counter([f"{c.provider}/{c.model}" for c in agent_calls])
                current_model_key = model_counts.most_common(1)[0][0]
                current_model = next((m for m in model_scores if m["model"] == current_model_key), None)

        # Calculate improvements if current model exists
        cost_savings = 0.0
        quality_improvement = 0.0
        speed_improvement = 0.0
        roi_estimate = 0.0

        if current_model and current_model["model"] != recommended["model"]:
            # Cost savings
            if current_model["avg_cost_per_call"] > 0:
                cost_savings = (1 - recommended["avg_cost_per_call"] / current_model["avg_cost_per_call"]) * 100

            # Quality improvement
            if current_model["avg_quality"] > 0:
                quality_improvement = ((recommended["avg_quality"] / current_model["avg_quality"]) - 1) * 100

            # Speed improvement
            if current_model["avg_latency_ms"] > 0:
                speed_improvement = (1 - recommended["avg_latency_ms"] / current_model["avg_latency_ms"]) * 100

            # ROI estimate (monthly savings based on current usage)
            if current_model["total_calls"] > 0:
                daily_calls = current_model["total_calls"] / days
                monthly_calls = daily_calls * 30
                current_monthly_cost = current_model["avg_cost_per_call"] * monthly_calls
                recommended_monthly_cost = recommended["avg_cost_per_call"] * monthly_calls
                roi_estimate = current_monthly_cost - recommended_monthly_cost

        return {
            "recommended_model": recommended["model"],
            "recommended_provider": recommended["provider"],
            "recommended_model_name": recommended["model_name"],
            "composite_score": recommended["composite_score"],
            "current_model": current_model["model"] if current_model else None,
            "cost_savings": cost_savings,
            "quality_improvement": quality_improvement,
            "speed_improvement": speed_improvement,
            "roi_estimate": roi_estimate,
            "all_models": model_scores[:5],  # Top 5 models
        }

    def simulate_model_switch(
        self,
        project_id: int,
        current_model: str,
        target_model: str,
        agent_name: Optional[str] = None,
        days: int = 7,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Simulate switching from one model to another

        Args:
            project_id: Project ID
            current_model: Current model (format: provider/model)
            target_model: Target model (format: provider/model)
            agent_name: Optional agent name to filter by task type
            days: Number of days to analyze
            db: Database session

        Returns:
            Dictionary with simulation results:
            - cost_change: float (percentage)
            - quality_change: float (percentage)
            - latency_change: float (percentage)
            - estimated_monthly_savings: float
            - estimated_monthly_cost: float
            - risk_assessment: str
        """
        if not db:
            raise ValueError("Database session required")

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Parse models
        current_provider, current_model_name = current_model.split("/", 1)
        target_provider, target_model_name = target_model.split("/", 1)

        # Get current model usage
        query = db.query(APICall).filter(
            and_(
                APICall.project_id == project_id,
                APICall.provider == current_provider,
                APICall.model == current_model_name,
                APICall.created_at >= start_date,
                APICall.created_at <= end_date,
            )
        )

        if agent_name:
            query = query.filter(APICall.agent_name == agent_name)

        current_calls = query.all()

        if not current_calls:
            return {
                "message": "No usage data for current model",
                "error": True,
            }

        # Calculate current metrics
        current_total_cost = 0.0
        current_total_latency = 0.0
        current_total_calls = len(current_calls)
        current_total_input_tokens = 0
        current_total_output_tokens = 0

        for call in current_calls:
            cost = self.calculate_cost(call.provider, call.model, call.request_tokens or 0, call.response_tokens or 0)
            current_total_cost += cost
            current_total_input_tokens += call.request_tokens or 0
            current_total_output_tokens += call.response_tokens or 0
            if call.latency_ms:
                current_total_latency += call.latency_ms

        current_avg_cost = current_total_cost / current_total_calls if current_total_calls > 0 else 0.0
        current_avg_latency = current_total_latency / current_total_calls if current_total_calls > 0 else 0.0

        # Get current quality scores
        from app.models.quality_score import QualityScore

        current_quality_scores = (
            db.query(QualityScore)
            .join(APICall)
            .filter(
                and_(
                    QualityScore.project_id == project_id,
                    APICall.provider == current_provider,
                    APICall.model == current_model_name,
                    QualityScore.created_at >= start_date,
                    QualityScore.created_at <= end_date,
                )
            )
            .all()
        )

        current_avg_quality = (
            sum([s.overall_score for s in current_quality_scores]) / len(current_quality_scores)
            if current_quality_scores
            else 50.0
        )

        # Simulate target model costs
        target_total_cost = 0.0
        for call in current_calls:
            # Use same token counts but different pricing
            cost = self.calculate_cost(
                target_provider, target_model_name, call.request_tokens or 0, call.response_tokens or 0
            )
            target_total_cost += cost

        target_avg_cost = target_total_cost / current_total_calls if current_total_calls > 0 else 0.0

        # Estimate target latency (use historical data if available, otherwise use pricing as proxy)
        target_calls = (
            db.query(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.provider == target_provider,
                    APICall.model == target_model_name,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date,
                )
            )
            .all()
        )

        if target_calls:
            target_total_latency = sum([c.latency_ms for c in target_calls if c.latency_ms])
            target_avg_latency = target_total_latency / len(target_calls) if target_calls else current_avg_latency
        else:
            # Estimate based on model tier (rough approximation)
            # Higher tier models typically have lower latency
            target_avg_latency = current_avg_latency * 0.9  # Assume 10% improvement for now

        # Estimate target quality (use historical data if available)
        target_quality_scores = (
            db.query(QualityScore)
            .join(APICall)
            .filter(
                and_(
                    QualityScore.project_id == project_id,
                    APICall.provider == target_provider,
                    APICall.model == target_model_name,
                    QualityScore.created_at >= start_date,
                    QualityScore.created_at <= end_date,
                )
            )
            .all()
        )

        if target_quality_scores:
            target_avg_quality = sum([s.overall_score for s in target_quality_scores]) / len(target_quality_scores)
        else:
            # Estimate based on model tier
            target_avg_quality = current_avg_quality * 1.05  # Assume 5% improvement for now

        # Calculate changes
        cost_change = ((target_avg_cost / current_avg_cost) - 1) * 100 if current_avg_cost > 0 else 0.0
        quality_change = ((target_avg_quality / current_avg_quality) - 1) * 100 if current_avg_quality > 0 else 0.0
        latency_change = ((target_avg_latency / current_avg_latency) - 1) * 100 if current_avg_latency > 0 else 0.0

        # Estimate monthly metrics
        daily_calls = current_total_calls / days
        monthly_calls = daily_calls * 30
        current_monthly_cost = current_avg_cost * monthly_calls
        target_monthly_cost = target_avg_cost * monthly_calls
        estimated_monthly_savings = current_monthly_cost - target_monthly_cost

        # Risk assessment
        risk_factors = []
        if cost_change > 20:
            risk_factors.append("High cost increase")
        if quality_change < -10:
            risk_factors.append("Significant quality decrease")
        if latency_change > 30:
            risk_factors.append("Significant latency increase")
        if not target_calls:
            risk_factors.append("No historical data for target model")

        risk_level = "low" if not risk_factors else ("medium" if len(risk_factors) <= 2 else "high")

        return {
            "current_model": current_model,
            "target_model": target_model,
            "cost_change": cost_change,
            "quality_change": quality_change,
            "latency_change": latency_change,
            "estimated_monthly_savings": estimated_monthly_savings,
            "estimated_monthly_cost": target_monthly_cost,
            "current_monthly_cost": current_monthly_cost,
            "risk_assessment": risk_level,
            "risk_factors": risk_factors,
            "recommendation": (
                "recommended"
                if estimated_monthly_savings > 0 and quality_change >= -5 and latency_change <= 20
                else "not_recommended"
            ),
        }

    def predict_future_costs(
        self, project_id: int, days: int = 30, prediction_days: int = 30, db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        향후 비용 예측

        Args:
            project_id: Project ID
            days: Number of days of historical data to analyze
            prediction_days: Number of days to predict ahead (7, 30, 90)
            db: Database session

        Returns:
            Dictionary with cost predictions
        """
        if not db:
            raise ValueError("Database session required")

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get historical cost data
        historical_analysis = self.analyze_project_costs(project_id, start_date=start_date, end_date=end_date, db=db)

        # Calculate daily costs
        daily_costs = historical_analysis.get("by_day", [])

        if not daily_costs:
            return {
                "predictions": [],
                "trend": "insufficient_data",
                "message": "Insufficient historical data for prediction",
            }

        # Calculate trend
        if len(daily_costs) >= 7:
            recent_avg = sum(d["cost"] for d in daily_costs[-7:]) / 7
            older_avg = (
                sum(d["cost"] for d in daily_costs[:-7]) / (len(daily_costs) - 7)
                if len(daily_costs) > 7
                else recent_avg
            )
            trend = ((recent_avg - older_avg) / older_avg * 100) if older_avg > 0 else 0
        else:
            trend = 0
            recent_avg = historical_analysis.get("average_daily_cost", 0)

        # Predict future costs
        predictions = []
        for days_ahead in [7, 30, 90]:
            if days_ahead <= prediction_days:
                # Simple linear prediction based on trend
                predicted_daily_cost = recent_avg * (1 + trend / 100)
                predicted_total = predicted_daily_cost * days_ahead

                # Calculate confidence based on data points
                confidence = min(0.95, 0.5 + (len(daily_costs) / 100))

                predictions.append(
                    {
                        "days_ahead": days_ahead,
                        "predicted_cost": predicted_total,
                        "predicted_daily_avg": predicted_daily_cost,
                        "confidence": confidence,
                        "trend_percentage": trend,
                    }
                )

        # Check for cost spike prediction
        spike_predicted = trend > 50  # If trend is > 50% increase
        budget_warning = False
        # In a real implementation, would compare against set budget

        return {
            "predictions": predictions,
            "trend": "increasing" if trend > 10 else "decreasing" if trend < -10 else "stable",
            "trend_percentage": trend,
            "current_daily_avg": recent_avg,
            "spike_predicted": spike_predicted,
            "budget_warning": budget_warning,
            "historical_data_days": len(daily_costs),
        }

    def check_monthly_budget_alert(
        self,
        project_id: int,
        threshold: float = 500.0,
        db: Optional[Session] = None
    ) -> Optional[Alert]:
        """월 비용 $500 초과 시 알림 생성"""
        if not db:
            raise ValueError("Database session required")
        
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        analysis = self.analyze_project_costs(
            project_id,
            start_date=month_start,
            end_date=now,
            db=db
        )
        
        if analysis["total_cost"] > threshold:
            from app.models.alert import Alert
            from app.infrastructure.repositories.alert_repository import AlertRepository
            
            alert_repo = AlertRepository(db)
            alert = Alert(
                project_id=project_id,
                alert_type="cost_threshold",
                severity="high",
                title=f"Monthly cost exceeded ${threshold}",
                message=f"Current monthly cost: ${analysis['total_cost']:.2f}",
                alert_data={
                    "monthly_cost": analysis["total_cost"],
                    "threshold": threshold,
                    "period_start": month_start.isoformat(),
                    "period_end": now.isoformat()
                },
                notification_channels=["email"]
            )
            # Background task이므로 save_and_commit() 사용
            return alert_repo.save_and_commit(alert)
        
        return None
