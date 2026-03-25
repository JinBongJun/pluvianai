"""
Dashboard service for real-time metrics and trend analysis
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.models.drift_detection import DriftDetection
from app.models.alert import Alert
from app.services.cache_service import cache_service
from app.core.logging_config import logger


class DashboardService:
    """Service for dashboard metrics and trend analysis"""

    def __init__(self):
        # Note: CostAnalyzer removed - cost analysis moved to later phase
        pass

    def get_realtime_metrics(
        self,
        project_id: int,
        period: str = "24h",  # 24h, 7d, 30d
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Get real-time metrics for a project

        Args:
            project_id: Project ID
            period: Time period (24h, 7d, 30d)
            db: Database session

        Returns:
            Dictionary with real-time metrics
        """
        if not db:
            raise ValueError("Database session required")

        # Calculate date range
        now = datetime.now(timezone.utc)
        if period == "24h":
            start_date = now - timedelta(hours=24)
            days = 1
        elif period == "7d":
            start_date = now - timedelta(days=7)
            days = 7
        elif period == "30d":
            start_date = now - timedelta(days=30)
            days = 30
        else:
            start_date = now - timedelta(hours=24)
            days = 1

        # Check cache
        cache_key = f"dashboard:metrics:{project_id}:{period}"
        cached = cache_service.get(cache_key)
        if cached:
            return cached

        # Get API calls
        api_calls = (
            db.query(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= now
                )
            )
            .all()
        )

        # Calculate basic stats
        total_calls = len(api_calls)
        successful_calls = sum(1 for call in api_calls if call.status_code and 200 <= call.status_code < 300)
        error_calls = total_calls - successful_calls
        error_rate = (error_calls / total_calls * 100) if total_calls > 0 else 0.0

        # Calculate average latency
        latencies = [call.latency_ms for call in api_calls if call.latency_ms]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0.0

        # Get quality scores
        quality_scores = (
            db.query(QualityScore)
            .filter(
                and_(
                    QualityScore.project_id == project_id,
                    QualityScore.created_at >= start_date,
                    QualityScore.created_at <= now
                )
            )
            .all()
        )

        # Calculate quality metrics
        quality_scores_list = [score.overall_score for score in quality_scores if score.overall_score]
        avg_quality_score = sum(quality_scores_list) / len(quality_scores_list) if quality_scores_list else None
        min_quality_score = min(quality_scores_list) if quality_scores_list else None
        max_quality_score = max(quality_scores_list) if quality_scores_list else None

        # Calculate quality trend (compare with previous period)
        prev_start = start_date - (now - start_date)
        prev_quality_scores = (
            db.query(QualityScore)
            .filter(
                and_(
                    QualityScore.project_id == project_id,
                    QualityScore.created_at >= prev_start,
                    QualityScore.created_at < start_date
                )
            )
            .all()
        )
        prev_quality_scores_list = [score.overall_score for score in prev_quality_scores if score.overall_score]
        prev_avg_quality = sum(prev_quality_scores_list) / len(prev_quality_scores_list) if prev_quality_scores_list else None

        quality_trend = None
        if avg_quality_score is not None and prev_avg_quality is not None:
            diff = avg_quality_score - prev_avg_quality
            if abs(diff) < 1.0:
                quality_trend = "stable"
            elif diff > 0:
                quality_trend = "up"
            else:
                quality_trend = "down"

        # Get drift detections
        drift_detections = (
            db.query(DriftDetection)
            .filter(
                and_(
                    DriftDetection.project_id == project_id,
                    DriftDetection.detected_at >= start_date,
                    DriftDetection.detected_at <= now
                )
            )
            .all()
        )
        drift_count = len(drift_detections)
        critical_drift_count = sum(1 for d in drift_detections if d.severity == "critical")

        # Calculate cost - placeholder, cost analysis moved to later phase
        total_cost = 0.0

        # Get recent alerts
        recent_alerts = (
            db.query(Alert)
            .filter(
                and_(
                    Alert.project_id == project_id,
                    Alert.created_at >= start_date,
                    Alert.created_at <= now
                )
            )
            .order_by(Alert.created_at.desc())
            .limit(10)
            .all()
        )

        metrics = {
            "period": period,
            "period_start": start_date.isoformat(),
            "period_end": now.isoformat(),
            "api_calls": {
                "total": total_calls,
                "successful": successful_calls,
                "errors": error_calls,
                "error_rate": round(error_rate, 2),
                "avg_latency_ms": round(avg_latency, 2) if avg_latency else None
            },
            "quality": {
                "avg_score": round(avg_quality_score, 2) if avg_quality_score else None,
                "min_score": round(min_quality_score, 2) if min_quality_score else None,
                "max_score": round(max_quality_score, 2) if max_quality_score else None,
                "trend": quality_trend,
                "total_evaluations": len(quality_scores)
            },
            "drift": {
                "total_detections": drift_count,
                "critical_detections": critical_drift_count
            },
            "cost": {
                "total": round(total_cost, 4),
                "avg_per_day": round(total_cost / days, 4) if days > 0 else 0.0
            },
            "recent_alerts": [
                {
                    "id": alert.id,
                    "type": alert.alert_type,
                    "severity": alert.severity,
                    "title": alert.title,
                    "created_at": alert.created_at.isoformat() if alert.created_at else None
                }
                for alert in recent_alerts
            ]
        }

        # Cache for 5 minutes
        cache_service.set(cache_key, metrics, ttl=300)
        return metrics

    def get_trend_analysis(
        self,
        project_id: int,
        period: str = "7d",  # 1d, 7d, 30d, 90d
        group_by: str = "hour",  # hour, day, week
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Get trend analysis for a project

        Args:
            project_id: Project ID
            period: Time period (1d, 7d, 30d, 90d)
            group_by: Grouping interval (hour, day, week)
            db: Database session

        Returns:
            Dictionary with trend data
        """
        if not db:
            raise ValueError("Database session required")

        # Calculate date range
        now = datetime.now(timezone.utc)
        if period == "1d":
            start_date = now - timedelta(days=1)
        elif period == "7d":
            start_date = now - timedelta(days=7)
        elif period == "30d":
            start_date = now - timedelta(days=30)
        elif period == "90d":
            start_date = now - timedelta(days=90)
        else:
            start_date = now - timedelta(days=7)

        # Check cache
        cache_key = f"dashboard:trends:{project_id}:{period}:{group_by}"
        cached = cache_service.get(cache_key)
        if cached:
            return cached

        # Get quality scores with time grouping
        if group_by == "hour":
            # Group by hour
            quality_query = (
                db.query(
                    func.date_trunc('hour', QualityScore.created_at).label('time_bucket'),
                    func.avg(QualityScore.overall_score).label('avg_score'),
                    func.count(QualityScore.id).label('count')
                )
                .filter(
                    and_(
                        QualityScore.project_id == project_id,
                        QualityScore.created_at >= start_date,
                        QualityScore.created_at <= now
                    )
                )
                .group_by('time_bucket')
                .order_by('time_bucket')
            )
        elif group_by == "day":
            # Group by day
            quality_query = (
                db.query(
                    func.date_trunc('day', QualityScore.created_at).label('time_bucket'),
                    func.avg(QualityScore.overall_score).label('avg_score'),
                    func.count(QualityScore.id).label('count')
                )
                .filter(
                    and_(
                        QualityScore.project_id == project_id,
                        QualityScore.created_at >= start_date,
                        QualityScore.created_at <= now
                    )
                )
                .group_by('time_bucket')
                .order_by('time_bucket')
            )
        else:  # week
            # Group by week
            quality_query = (
                db.query(
                    func.date_trunc('week', QualityScore.created_at).label('time_bucket'),
                    func.avg(QualityScore.overall_score).label('avg_score'),
                    func.count(QualityScore.id).label('count')
                )
                .filter(
                    and_(
                        QualityScore.project_id == project_id,
                        QualityScore.created_at >= start_date,
                        QualityScore.created_at <= now
                    )
                )
                .group_by('time_bucket')
                .order_by('time_bucket')
            )

        quality_trends = quality_query.all()

        # Get API calls by model
        model_stats = (
            db.query(
                APICall.model,
                APICall.provider,
                func.count(APICall.id).label('count'),
                func.avg(APICall.latency_ms).label('avg_latency'),
                func.sum(
                    case(
                        (and_(APICall.status_code >= 200, APICall.status_code < 300), 1),
                        else_=0
                    )
                ).label('successful')
            )
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= now
                )
            )
            .group_by(APICall.model, APICall.provider)
            .all()
        )

        # Get API calls by agent
        agent_stats = (
            db.query(
                APICall.agent_name,
                func.count(APICall.id).label('count'),
                func.avg(APICall.latency_ms).label('avg_latency'),
                func.sum(
                    case(
                        (and_(APICall.status_code >= 200, APICall.status_code < 300), 1),
                        else_=0
                    )
                ).label('successful')
            )
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= now,
                    APICall.agent_name.isnot(None)
                )
            )
            .group_by(APICall.agent_name)
            .all()
        )

        # Format quality trends
        quality_data = [
            {
                "time": row.time_bucket.isoformat() if row.time_bucket else None,
                "avg_score": round(float(row.avg_score), 2) if row.avg_score else None,
                "count": row.count
            }
            for row in quality_trends
        ]

        # Format model comparison
        model_comparison = [
            {
                "model": f"{row.provider}/{row.model}",
                "provider": row.provider,
                "model_name": row.model,
                "total_calls": row.count,
                "successful_calls": row.successful or 0,
                "success_rate": round((row.successful or 0) / row.count * 100, 2) if row.count > 0 else 0.0,
                "avg_latency_ms": round(float(row.avg_latency), 2) if row.avg_latency else None
            }
            for row in model_stats
        ]

        # Format agent comparison
        agent_comparison = [
            {
                "agent_name": row.agent_name,
                "total_calls": row.count,
                "successful_calls": row.successful or 0,
                "success_rate": round((row.successful or 0) / row.count * 100, 2) if row.count > 0 else 0.0,
                "avg_latency_ms": round(float(row.avg_latency), 2) if row.avg_latency else None
            }
            for row in agent_stats
        ]

        trends = {
            "period": period,
            "group_by": group_by,
            "period_start": start_date.isoformat(),
            "period_end": now.isoformat(),
            "quality_trends": quality_data,
            "model_comparison": model_comparison,
            "agent_comparison": agent_comparison
        }

        # Cache for 5 minutes
        cache_service.set(cache_key, trends, ttl=300)
        return trends
