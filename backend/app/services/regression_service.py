"""
Regression Service - Orchestrates regression detection workflow

Flow:
1. Run replay in Test Lab (model change or prompt change)
2. Detect signals on each response
3. Collect worst prompts
4. Calculate final status (SAFE / REGRESSED / CRITICAL)
5. Create review for human decision
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.services.signal_detection_service import SignalDetectionService
from app.services.worst_prompt_service import WorstPromptService
from app.services.review_service import ReviewService
from app.core.logging_config import logger


class RegressionStatus:
    """Regression status constants"""
    SAFE = "safe"
    REGRESSED = "regressed"
    CRITICAL = "critical"
    PENDING = "pending"


class RegressionService:
    """Service for regression detection and status management"""
    
    def __init__(self, db: Session):
        self.db = db
        self.signal_service = SignalDetectionService(db)
        self.worst_prompt_service = WorstPromptService(db)
        self.review_service = ReviewService(db)
    
    def run_regression_test(
        self,
        project_id: int,
        test_cases: List[Dict],
        model_before: str,
        model_after: str,
        create_review: bool = True,
    ) -> Dict[str, Any]:
        """Run a complete regression test"""
        results = []
        all_signals = []
        
        baseline = self._get_baseline_data(project_id)
        
        for i, case in enumerate(test_cases):
            prompt = case.get("prompt", "")
            response_before = case.get("response_before", "")
            response_after = case.get("response_after", "")
            snapshot_id = case.get("snapshot_id")
            request_data = case.get("request_data")
            response_data = case.get("response_data")
            
            signal_result = self.signal_service.detect_all_signals(
                project_id=project_id,
                response_text=response_after,
                request_data=request_data,
                response_data=response_data,
                baseline_data={
                    "avg_length": len(response_before) if response_before else baseline.get("avg_length", 0),
                    "avg_latency": baseline.get("avg_latency", 0),
                },
                snapshot_id=snapshot_id,
            )
            
            case_status = self._determine_case_status(signal_result)
            
            if case_status in ["failed", "flagged"] and signal_result.get("signals"):
                self.worst_prompt_service.collect_from_signals(
                    project_id=project_id,
                    snapshot_id=snapshot_id,
                    signals=signal_result.get("signals", []),
                    prompt_text=prompt,
                    response_text=response_after,
                    model=model_after,
                )
            
            case_result = {
                "index": i,
                "prompt": prompt[:200] + "..." if len(prompt) > 200 else prompt,
                "snapshot_id": snapshot_id,
                "response_before": response_before[:500] if response_before else None,
                "response_after": response_after[:500] if response_after else None,
                "status": case_status,
                "signals": signal_result.get("signals", []),
                "signal_count": signal_result.get("signal_count", 0),
            }
            results.append(case_result)
            all_signals.extend(signal_result.get("signals", []))
        
        overall_status = self._calculate_overall_status(results)
        signal_summary = self._aggregate_signals(all_signals)
        
        regression_result = {
            "status": overall_status,
            "model_before": model_before,
            "model_after": model_after,
            "test_count": len(results),
            "passed_count": len([r for r in results if r["status"] == "passed"]),
            "failed_count": len([r for r in results if r["status"] in ["failed", "flagged"]]),
            "signals": signal_summary,
            "results": results,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        review = None
        if create_review:
            review = self.review_service.create_review_from_replay(
                project_id=project_id,
                replay_id=0,
                replay_results=regression_result,
                model_before=model_before,
                model_after=model_after,
            )
            regression_result["review_id"] = review.id
        
        return regression_result
    
    def check_single_response(
        self,
        project_id: int,
        response_text: str,
        request_data: Optional[Dict] = None,
        response_data: Optional[Dict] = None,
        baseline_response: Optional[str] = None,
        snapshot_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Check a single response for regression"""
        baseline = self._get_baseline_data(project_id)
        
        signal_result = self.signal_service.detect_all_signals(
            project_id=project_id,
            response_text=response_text,
            request_data=request_data,
            response_data=response_data,
            baseline_data={
                "avg_length": len(baseline_response) if baseline_response else baseline.get("avg_length", 0),
                "avg_latency": baseline.get("avg_latency", 0),
            },
            snapshot_id=snapshot_id,
        )
        
        return {
            "status": signal_result.get("status", "safe"),
            "signals": signal_result.get("signals", []),
            "signal_count": signal_result.get("signal_count", 0),
            "critical_count": signal_result.get("critical_count", 0),
            "high_count": signal_result.get("high_count", 0),
        }
    
    def get_project_regression_status(self, project_id: int) -> Dict[str, Any]:
        """Get the current regression status for a project"""
        recent_reviews = self.review_service.get_reviews(project_id, limit=10)
        review_stats = self.review_service.get_review_stats(project_id)
        worst_prompt_stats = self.worst_prompt_service.get_worst_prompt_stats(project_id)
        
        if recent_reviews:
            latest_review = recent_reviews[0]
            current_status = latest_review.regression_status
        else:
            current_status = "safe"
        
        return {
            "current_status": current_status,
            "review_stats": review_stats,
            "worst_prompt_stats": worst_prompt_stats,
            "recent_reviews": [
                {
                    "id": r.id,
                    "title": r.title,
                    "status": r.status,
                    "regression_status": r.regression_status,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in recent_reviews[:5]
            ],
        }
    
    def _get_baseline_data(self, project_id: int) -> Dict[str, Any]:
        """Get baseline data for a project"""
        from sqlalchemy import func
        from app.models.api_call import APICall
        
        try:
            avg_latency_result = self.db.query(
                func.avg(APICall.latency_ms)
            ).filter(
                APICall.project_id == project_id,
                APICall.status_code == 200,
            ).scalar()
            
            return {
                "avg_length": 500,  # Default
                "avg_latency": float(avg_latency_result or 1000),
            }
        except Exception:
            return {
                "avg_length": 500,
                "avg_latency": 1000,
            }
    
    def _determine_case_status(self, signal_result: Dict) -> str:
        """Determine case status based on signal result"""
        status = signal_result.get("status", "safe")
        
        if status == "critical":
            return "failed"
        elif status == "regressed":
            return "flagged"
        else:
            return "passed"
    
    def _calculate_overall_status(self, results: List[Dict]) -> str:
        """Calculate overall status from all results"""
        failed_count = len([r for r in results if r["status"] == "failed"])
        flagged_count = len([r for r in results if r["status"] == "flagged"])
        total = len(results)
        
        if total == 0:
            return RegressionStatus.SAFE
        
        if failed_count > 0:
            return RegressionStatus.CRITICAL
        
        if flagged_count > 0 and (flagged_count / total) >= 0.1:
            return RegressionStatus.REGRESSED
        
        if flagged_count > 0:
            return RegressionStatus.REGRESSED
        
        return RegressionStatus.SAFE
    
    def _aggregate_signals(self, signals: List[Dict]) -> Dict[str, Any]:
        """Aggregate signals into summary"""
        by_type = {}
        by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        
        for signal in signals:
            signal_type = signal.get("signal_type", "unknown")
            severity = signal.get("severity", "low")
            
            if signal_type not in by_type:
                by_type[signal_type] = 0
            by_type[signal_type] += 1
            
            if severity in by_severity:
                by_severity[severity] += 1
        
        return {
            "total": len(signals),
            "by_type": by_type,
            "by_severity": by_severity,
            "status": self._status_from_severity(by_severity),
        }
    
    def _status_from_severity(self, by_severity: Dict) -> str:
        """Determine status from severity counts"""
        if by_severity.get("critical", 0) > 0:
            return RegressionStatus.CRITICAL
        if by_severity.get("high", 0) >= 2:
            return RegressionStatus.CRITICAL
        if by_severity.get("high", 0) > 0:
            return RegressionStatus.REGRESSED
        if by_severity.get("medium", 0) >= 3:
            return RegressionStatus.REGRESSED
        return RegressionStatus.SAFE
