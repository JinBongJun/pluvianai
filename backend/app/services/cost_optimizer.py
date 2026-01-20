"""
Cost Optimizer for automatic cost optimization suggestions
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta
from collections import defaultdict
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.services.cost_analyzer import CostAnalyzer
from app.core.logging_config import logger


class CostOptimizer:
    """
    자동 비용 최적화 엔진
    - 안전장치 포함
    - 사용자 승인 필수
    """

    SAFETY_THRESHOLDS = {
        "max_quality_drop": 5.0,  # 품질 하락 최대 5%
        "min_quality_score": 75.0,  # 최소 품질 점수 75
        "max_cost_increase": 0.0,  # 비용 증가 불가
        "min_test_samples": 100,  # 최소 테스트 샘플 수
    }

    def __init__(self):
        self.cost_analyzer = CostAnalyzer()

    def suggest_optimizations(self, project_id: int, days: int = 30, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        비용 최적화 제안 (제안만, 자동 적용 안 함)

        Args:
            project_id: Project ID
            days: Number of days to analyze
            db: Database session

        Returns:
            Dictionary with optimization suggestions
        """
        if not db:
            raise ValueError("Database session required")

        # 1. 사용 패턴 분석
        usage_patterns = self._analyze_usage_patterns(project_id, days, db)

        # 2. 비용 절감 기회 발견
        opportunities = []

        # 패턴 1: 고가 모델을 단순 작업에 사용
        simple_task_opportunities = self._find_simple_task_opportunities(usage_patterns, db)
        opportunities.extend(simple_task_opportunities)

        # 패턴 2: 비슷한 성능의 저가 모델 발견
        cheaper_model_opportunities = self._find_cheaper_model_opportunities(usage_patterns, db)
        opportunities.extend(cheaper_model_opportunities)

        # 패턴 3: 사용하지 않는 모델 제거
        unused_model_opportunities = self._find_unused_model_opportunities(usage_patterns, db)
        opportunities.extend(unused_model_opportunities)

        # 3. 안전장치 확인 및 필터링
        safe_opportunities = []
        for opp in opportunities:
            if self._check_safety(opp):
                safe_opportunities.append(opp)

        # 4. 총 절감액 계산
        total_potential_savings = sum(o.get("estimated_monthly_savings", 0) for o in safe_opportunities)

        return {
            "opportunities": safe_opportunities,
            "total_potential_savings": total_potential_savings,
            "analysis_period_days": days,
            "auto_apply": False,  # 자동 적용 안 함
            "requires_approval": True,  # 승인 필수
        }

    def _analyze_usage_patterns(self, project_id: int, days: int, db: Session) -> List[Dict[str, Any]]:
        """사용 패턴 분석"""
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get API calls
        api_calls = (
            db.query(APICall)
            .filter(
                and_(APICall.project_id == project_id, APICall.created_at >= start_date, APICall.created_at <= end_date)
            )
            .all()
        )

        # Group by model
        model_patterns: Dict[str, Dict[str, Any]] = {}

        for call in api_calls:
            model_key = f"{call.provider}/{call.model}"

            if model_key not in model_patterns:
                model_patterns[model_key] = {
                    "model": model_key,
                    "provider": call.provider,
                    "model_name": call.model,
                    "total_calls": 0,
                    "total_cost": 0.0,
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                    "total_latency": 0.0,
                    "quality_scores": [],
                }

            pattern = model_patterns[model_key]
            pattern["total_calls"] += 1
            pattern["total_input_tokens"] += call.request_tokens or 0
            pattern["total_output_tokens"] += call.response_tokens or 0
            pattern["total_latency"] += call.latency_ms or 0

            # Calculate cost
            cost = self.cost_analyzer.calculate_cost(
                call.provider, call.model, call.request_tokens or 0, call.response_tokens or 0
            )
            pattern["total_cost"] += cost

        # Get quality scores
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
                if model_key in model_patterns:
                    model_patterns[model_key]["quality_scores"].append(score.overall_score)

        # Calculate averages
        patterns = []
        for model_key, pattern in model_patterns.items():
            pattern["avg_cost_per_call"] = (
                pattern["total_cost"] / pattern["total_calls"] if pattern["total_calls"] > 0 else 0.0
            )
            pattern["avg_latency_ms"] = (
                pattern["total_latency"] / pattern["total_calls"] if pattern["total_calls"] > 0 else 0.0
            )
            pattern["avg_quality_score"] = (
                sum(pattern["quality_scores"]) / len(pattern["quality_scores"]) if pattern["quality_scores"] else 75.0
            )

            # Calculate monthly cost estimate
            daily_cost = pattern["total_cost"] / days if days > 0 else 0.0
            pattern["estimated_monthly_cost"] = daily_cost * 30

            patterns.append(pattern)

        return patterns

    def _find_simple_task_opportunities(
        self, usage_patterns: List[Dict[str, Any]], db: Session
    ) -> List[Dict[str, Any]]:
        """고가 모델을 단순 작업에 사용하는 패턴 발견"""
        opportunities = []

        # High-cost models that are used for simple tasks (low quality requirement, low complexity)
        high_cost_models = ["gpt-4", "gpt-4-turbo", "claude-3-opus", "gemini-ultra"]

        for pattern in usage_patterns:
            model_name = pattern.get("model_name", "")

            # Check if it's a high-cost model
            is_high_cost = any(hc in model_name.lower() for hc in high_cost_models)

            if not is_high_cost:
                continue

            # Check if quality requirement is low (simple task)
            avg_quality = pattern.get("avg_quality_score", 75.0)
            avg_latency = pattern.get("avg_latency_ms", 0)

            # Simple task indicators:
            # - Low quality requirement (< 70)
            # - Low latency (< 2000ms)
            # - Low token usage
            is_simple_task = (
                avg_quality < 70
                and avg_latency < 2000
                and pattern.get("total_input_tokens", 0) / pattern.get("total_calls", 1) < 500
            )

            if is_simple_task:
                # Suggest cheaper model
                recommended_model = "gpt-3.5-turbo" if "gpt" in model_name.lower() else "claude-3-haiku"

                # Estimate new cost
                current_monthly_cost = pattern.get("estimated_monthly_cost", 0.0)
                # Estimate 80% cost reduction for downgrade
                estimated_savings = current_monthly_cost * 0.8

                opportunities.append(
                    {
                        "type": "model_downgrade",
                        "current_model": pattern.get("model"),
                        "recommended_model": f"{pattern.get('provider')}/{recommended_model}",
                        "savings_percentage": 80.0,
                        "estimated_monthly_savings": estimated_savings,
                        "quality_change": -5.0,  # Estimated quality drop
                        "new_quality": max(65.0, avg_quality - 5.0),
                        "cost_change": -80.0,
                        "risk": "low",
                        "reason": f"Simple tasks (avg quality: {avg_quality:.1f}) don't need high-cost model",
                    }
                )

        return opportunities

    def _find_cheaper_model_opportunities(
        self, usage_patterns: List[Dict[str, Any]], db: Session
    ) -> List[Dict[str, Any]]:
        """비슷한 성능의 저가 모델 발견"""
        opportunities = []

        # Compare models with similar quality but different costs
        for i, pattern1 in enumerate(usage_patterns):
            for pattern2 in usage_patterns[i + 1 :]:
                # Check if quality is similar but cost is different
                quality1 = pattern1.get("avg_quality_score", 75.0)
                quality2 = pattern2.get("avg_quality_score", 75.0)
                cost1 = pattern1.get("estimated_monthly_cost", 0.0)
                cost2 = pattern2.get("estimated_monthly_cost", 0.0)

                # Quality difference < 5%
                quality_diff = abs(quality1 - quality2)

                if quality_diff < 5.0 and cost1 > cost2 * 1.2:  # cost1 is at least 20% more expensive
                    # Suggest cheaper model
                    opportunities.append(
                        {
                            "type": "cost_optimization",
                            "current_model": pattern1.get("model"),
                            "recommended_model": pattern2.get("model"),
                            "savings_percentage": ((cost1 - cost2) / cost1 * 100) if cost1 > 0 else 0,
                            "estimated_monthly_savings": cost1 - cost2,
                            "quality_change": quality2 - quality1,  # Should be close to 0
                            "new_quality": quality2,
                            "cost_change": -((cost1 - cost2) / cost1 * 100) if cost1 > 0 else 0,
                            "risk": "low",
                            "reason": f"Similar quality ({quality2:.1f} vs {quality1:.1f}) but {((cost1 - cost2) / cost1 * 100):.1f}% cheaper",
                        }
                    )

        return opportunities

    def _find_unused_model_opportunities(
        self, usage_patterns: List[Dict[str, Any]], db: Session
    ) -> List[Dict[str, Any]]:
        """사용하지 않는 모델 제거 기회"""
        opportunities = []

        # Find models with very low usage
        for pattern in usage_patterns:
            total_calls = pattern.get("total_calls", 0)
            monthly_cost = pattern.get("estimated_monthly_cost", 0.0)

            # If usage is very low (< 10 calls) but still costs money
            if total_calls < 10 and monthly_cost > 1.0:  # Less than $1/month is negligible
                opportunities.append(
                    {
                        "type": "remove_unused_model",
                        "current_model": pattern.get("model"),
                        "recommended_model": None,
                        "savings_percentage": 100.0,
                        "estimated_monthly_savings": monthly_cost,
                        "quality_change": 0.0,  # No quality impact (not using it)
                        "new_quality": 0.0,
                        "cost_change": -100.0,
                        "risk": "none",
                        "reason": f"Very low usage ({total_calls} calls) with ${monthly_cost:.2f}/month cost",
                    }
                )

        return opportunities

    def _check_safety(self, opportunity: Dict[str, Any]) -> bool:
        """
        안전장치 확인

        Args:
            opportunity: Optimization opportunity dictionary

        Returns:
            True if optimization passes safety checks, False otherwise
        """
        # 품질 하락 확인
        quality_change = opportunity.get("quality_change", 0)
        if quality_change < -self.SAFETY_THRESHOLDS["max_quality_drop"]:
            logger.debug(f"Optimization rejected: Quality drop too large ({quality_change}%)")
            return False

        # 최소 품질 점수 확인
        new_quality = opportunity.get("new_quality", 100.0)
        if new_quality < self.SAFETY_THRESHOLDS["min_quality_score"]:
            logger.debug(f"Optimization rejected: Quality score too low ({new_quality})")
            return False

        # 비용 증가 확인
        cost_change = opportunity.get("cost_change", 0)
        if cost_change > self.SAFETY_THRESHOLDS["max_cost_increase"]:
            logger.debug(f"Optimization rejected: Cost increase ({cost_change}%)")
            return False

        return True
