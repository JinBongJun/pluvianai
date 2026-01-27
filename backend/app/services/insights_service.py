"""
Insights Service for AI-powered daily summaries and Z-Score based anomaly detection
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.core.logging_config import logger
from app.services.base_analysis_service import BaseAnalysisService
import statistics


class InsightService(BaseAnalysisService):
    """Service for generating daily insights with Z-Score anomaly detection"""

    def __init__(self, db: Session):
        self.db = db

    def analyze(
        self,
        project_id: int,
        days: int = 7,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform insights analysis (implements BaseAnalysisService interface)
        Note: This service uses target_date instead of days
        """
        target_date = kwargs.get("target_date")
        return self.generate_daily_insights(project_id, target_date)
    
    def generate_daily_insights(
        self,
        project_id: int,
        target_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Generate daily insights with Z-Score based anomaly detection
        
        Args:
            project_id: Project ID
            target_date: Target date (defaults to today)
            
        Returns:
            Dict with:
                - summary: AI-generated summary text
                - anomalies: List of detected anomalies
                - metrics: Key metrics for the day
                - trends: Trend indicators
        """
        if target_date is None:
            target_date = datetime.utcnow()
        
        # Get date range (last 30 days for baseline)
        end_date = target_date.replace(hour=23, minute=59, second=59)
        start_date = (end_date - timedelta(days=30)).replace(hour=0, minute=0, second=0)
        target_start = target_date.replace(hour=0, minute=0, second=0)
        target_end = target_date.replace(hour=23, minute=59, second=59)
        
        # Get API calls for the period
        api_calls = (
            self.db.query(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date
                )
            )
            .order_by(APICall.created_at.asc())
            .all()
        )
        
        # Get quality scores for the period
        quality_scores = (
            self.db.query(QualityScore)
            .filter(
                and_(
                    QualityScore.project_id == project_id,
                    QualityScore.created_at >= start_date,
                    QualityScore.created_at <= end_date
                )
            )
            .order_by(QualityScore.created_at.asc())
            .all()
        )
        
        # Calculate daily metrics for baseline (last 30 days)
        daily_metrics = self._calculate_daily_metrics(api_calls, quality_scores, start_date, end_date)
        
        # Get today's metrics
        today_calls = [c for c in api_calls if target_start <= c.created_at <= target_end]
        today_scores = [s for s in quality_scores if target_start <= s.created_at <= target_end]
        
        today_metrics = {
            "call_count": len(today_calls),
            "avg_latency": statistics.mean([c.latency_ms for c in today_calls if c.latency_ms]) if today_calls else 0,
            "avg_quality_score": statistics.mean([s.overall_score for s in today_scores]) if today_scores else 0,
            "error_rate": len([c for c in today_calls if c.status_code and c.status_code >= 400]) / len(today_calls) if today_calls else 0,
        }
        
        # Calculate Z-Scores for anomaly detection
        anomalies = self._detect_anomalies(daily_metrics, today_metrics)
        
        # Generate AI summary (simplified for MVP - in production, use LLM)
        summary = self._generate_summary(today_metrics, anomalies, daily_metrics)
        
        # Calculate trends
        trends = self._calculate_trends(daily_metrics, today_metrics)
        
        return {
            "date": target_date.strftime("%Y-%m-%d"),
            "summary": summary,
            "anomalies": anomalies,
            "metrics": today_metrics,
            "trends": trends,
            "baseline_period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": 30,
            },
        }

    def _calculate_daily_metrics(
        self,
        api_calls: List[APICall],
        quality_scores: List[QualityScore],
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """Calculate daily metrics for baseline period"""
        daily_data: Dict[str, Dict[str, Any]] = {}
        
        current_date = start_date
        while current_date <= end_date:
            day_key = current_date.strftime("%Y-%m-%d")
            day_start = current_date.replace(hour=0, minute=0, second=0)
            day_end = current_date.replace(hour=23, minute=59, second=59)
            
            day_calls = [c for c in api_calls if day_start <= c.created_at <= day_end]
            day_scores = [s for s in quality_scores if day_start <= s.created_at <= day_end]
            
            daily_data[day_key] = {
                "date": day_key,
                "call_count": len(day_calls),
                "avg_latency": statistics.mean([c.latency_ms for c in day_calls if c.latency_ms]) if day_calls else 0,
                "avg_quality_score": statistics.mean([s.overall_score for s in day_scores]) if day_scores else 0,
                "error_rate": len([c for c in day_calls if c.status_code and c.status_code >= 400]) / len(day_calls) if day_calls else 0,
            }
            
            current_date += timedelta(days=1)
        
        return list(daily_data.values())

    def _detect_anomalies(
        self,
        baseline_metrics: List[Dict[str, Any]],
        today_metrics: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Detect anomalies using Z-Score method
        
        Z-Score = (value - mean) / standard_deviation
        Anomaly if |Z-Score| > 2 (95% confidence)
        """
        anomalies = []
        
        if not baseline_metrics:
            return anomalies
        
        # Extract time series for each metric
        metrics_to_check = ["call_count", "avg_latency", "avg_quality_score", "error_rate"]
        
        for metric_name in metrics_to_check:
            values = [m.get(metric_name, 0) for m in baseline_metrics if m.get(metric_name) is not None]
            
            if len(values) < 7:  # Need at least 7 days for meaningful statistics
                continue
            
            # Calculate Moving Average (MA) and Standard Deviation (σ)
            mean = statistics.mean(values)
            std_dev = statistics.stdev(values) if len(values) > 1 else 0
            
            if std_dev == 0:
                continue
            
            # Get today's value
            today_value = today_metrics.get(metric_name, 0)
            
            # Calculate Z-Score
            z_score = (today_value - mean) / std_dev if std_dev > 0 else 0
            
            # Anomaly if |Z-Score| > 2 (95% confidence interval)
            if abs(z_score) > 2:
                severity = "high" if abs(z_score) > 3 else "medium"
                
                anomalies.append({
                    "metric": metric_name,
                    "value": today_value,
                    "baseline_mean": round(mean, 2),
                    "baseline_std": round(std_dev, 2),
                    "z_score": round(z_score, 2),
                    "severity": severity,
                    "direction": "increase" if z_score > 0 else "decrease",
                    "message": self._get_anomaly_message(metric_name, z_score, today_value, mean),
                })
        
        return anomalies

    def _get_anomaly_message(
        self,
        metric_name: str,
        z_score: float,
        value: float,
        baseline: float
    ) -> str:
        """Generate human-readable anomaly message"""
        direction = "increased" if z_score > 0 else "decreased"
        change_pct = abs((value - baseline) / baseline * 100) if baseline > 0 else 0
        
        metric_labels = {
            "call_count": "API call count",
            "avg_latency": "average latency",
            "avg_quality_score": "quality score",
            "error_rate": "error rate",
        }
        
        metric_label = metric_labels.get(metric_name, metric_name)
        
        return f"{metric_label.capitalize()} {direction} by {change_pct:.1f}% (Z-Score: {z_score:.2f})"

    def _generate_summary(
        self,
        today_metrics: Dict[str, Any],
        anomalies: List[Dict[str, Any]],
        baseline_metrics: List[Dict[str, Any]]
    ) -> str:
        """
        Generate AI summary (simplified for MVP)
        In production, this would use an LLM to generate natural language summaries
        """
        if not baseline_metrics:
            return "Insufficient data for insights. Check back after more API calls."
        
        # Calculate averages for context
        avg_calls = statistics.mean([m.get("call_count", 0) for m in baseline_metrics])
        avg_latency = statistics.mean([m.get("avg_latency", 0) for m in baseline_metrics if m.get("avg_latency")])
        avg_quality = statistics.mean([m.get("avg_quality_score", 0) for m in baseline_metrics if m.get("avg_quality_score")])
        
        summary_parts = []
        
        # Today's activity
        if today_metrics["call_count"] > 0:
            summary_parts.append(
                f"Today: {today_metrics['call_count']:.0f} API calls "
                f"(avg: {avg_calls:.0f}/day)"
            )
        
        # Anomalies
        if anomalies:
            high_severity = [a for a in anomalies if a["severity"] == "high"]
            if high_severity:
                summary_parts.append(
                    f"⚠️ {len(high_severity)} high-severity anomaly detected"
                )
            else:
                summary_parts.append(
                    f"📊 {len(anomalies)} anomaly detected"
                )
        else:
            summary_parts.append("✅ No anomalies detected - system operating normally")
        
        # Quality trend
        if today_metrics["avg_quality_score"] > 0:
            quality_diff = today_metrics["avg_quality_score"] - avg_quality
            if abs(quality_diff) > 5:
                trend = "improved" if quality_diff > 0 else "declined"
                summary_parts.append(
                    f"Quality score {trend} by {abs(quality_diff):.1f} points"
                )
        
        return ". ".join(summary_parts) + "."

    def _calculate_trends(
        self,
        baseline_metrics: List[Dict[str, Any]],
        today_metrics: Dict[str, Any]
    ) -> Dict[str, str]:
        """Calculate trend indicators (up, down, stable)"""
        if not baseline_metrics:
            return {}
        
        # Get last 7 days for trend comparison
        recent_metrics = baseline_metrics[-7:] if len(baseline_metrics) >= 7 else baseline_metrics
        
        trends = {}
        
        # Compare each metric
        for metric_name in ["call_count", "avg_latency", "avg_quality_score", "error_rate"]:
            if metric_name not in today_metrics:
                continue
            
            recent_values = [m.get(metric_name, 0) for m in recent_metrics if m.get(metric_name) is not None]
            if not recent_values:
                continue
            
            recent_avg = statistics.mean(recent_values)
            today_value = today_metrics[metric_name]
            
            # Determine trend
            change_pct = ((today_value - recent_avg) / recent_avg * 100) if recent_avg > 0 else 0
            
            if abs(change_pct) < 5:
                trends[metric_name] = "stable"
            elif change_pct > 0:
                trends[metric_name] = "up"
            else:
                trends[metric_name] = "down"
        
        return trends
