"""
Review Service - Human-in-the-loop workflow for deployment decisions

Workflow:
1. Auto-detect signals
2. Create review with detected issues
3. Human reviews and makes final decision
4. Decision: approve_deploy / reject_deploy / rollback
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
from app.core.logging_config import logger


class ReviewService:
    """Service for human-in-the-loop review workflow"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def _get_models(self):
        """Lazy import models to avoid circular imports"""
        from app.models.review import Review, ReviewComment, ReviewCase
        return Review, ReviewComment, ReviewCase
    
    def create_review(
        self,
        project_id: int,
        title: str,
        replay_id: Optional[int] = None,
        description: Optional[str] = None,
        signals_detected: Optional[Dict] = None,
        model_before: Optional[str] = None,
        model_after: Optional[str] = None,
        test_count: int = 0,
        passed_count: int = 0,
        failed_count: int = 0,
        origin: Optional[str] = None,
        test_run_id: Optional[str] = None,
    ):
        """Create a new review"""
        Review, _, _ = self._get_models()
        
        regression_status = self._calculate_regression_status(signals_detected)
        affected_cases = failed_count
        
        review = Review(
            project_id=project_id,
            replay_id=replay_id,
            test_run_id=test_run_id,
            origin=origin,
            title=title,
            description=description,
            status="pending",
            regression_status=regression_status,
            signals_detected=signals_detected,
            affected_cases=affected_cases,
            model_before=model_before,
            model_after=model_after,
            test_count=test_count,
            passed_count=passed_count,
            failed_count=failed_count,
        )
        
        self.db.add(review)
        self.db.commit()
        self.db.refresh(review)
        
        self._add_system_comment(
            review.id,
            f"Review created. Regression status: {regression_status.upper()}"
        )
        
        return review
    
    def get_reviews(
        self,
        project_id: int,
        status: Optional[str] = None,
        regression_status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List:
        """Get reviews with filters"""
        Review, _, _ = self._get_models()
        
        query = self.db.query(Review).filter(
            Review.project_id == project_id
        )
        
        if status:
            query = query.filter(Review.status == status)
        if regression_status:
            query = query.filter(Review.regression_status == regression_status)
        
        return query.order_by(desc(Review.created_at)).offset(offset).limit(limit).all()
    
    def get_pending_reviews(self, project_id: int) -> List:
        """Get all pending reviews for a project"""
        return self.get_reviews(project_id, status="pending")
    
    def get_review_by_id(self, review_id: int):
        """Get a review by ID"""
        Review, _, _ = self._get_models()
        return self.db.query(Review).filter(Review.id == review_id).first()
    
    def approve_review(
        self,
        review_id: int,
        reviewer_id: int,
        decision_note: Optional[str] = None
    ):
        """Approve a review for deployment"""
        return self._make_decision(
            review_id=review_id,
            reviewer_id=reviewer_id,
            status="approved",
            decision="approve_deploy",
            decision_note=decision_note,
        )
    
    def reject_review(
        self,
        review_id: int,
        reviewer_id: int,
        decision_note: Optional[str] = None
    ):
        """Reject a review (do not deploy)"""
        return self._make_decision(
            review_id=review_id,
            reviewer_id=reviewer_id,
            status="rejected",
            decision="reject_deploy",
            decision_note=decision_note,
        )
    
    def request_discussion(
        self,
        review_id: int,
        reviewer_id: int,
        note: str
    ):
        """Mark review as needing discussion"""
        review = self.get_review_by_id(review_id)
        if not review:
            return None
        
        review.status = "needs_discussion"
        
        self.db.commit()
        self.db.refresh(review)
        
        self.add_comment(review_id, reviewer_id, note)
        self._add_system_comment(review_id, "Review marked for discussion")
        
        return review
    
    def _make_decision(
        self,
        review_id: int,
        reviewer_id: int,
        status: str,
        decision: str,
        decision_note: Optional[str] = None,
    ):
        """Make a decision on a review"""
        review = self.get_review_by_id(review_id)
        if not review:
            return None
        
        review.status = status
        review.decision = decision
        review.decision_note = decision_note
        review.reviewer_id = reviewer_id
        review.reviewed_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(review)
        
        self._add_system_comment(
            review_id,
            f"Decision: {decision.upper()}. Status changed to {status}."
        )
        
        return review
    
    def _calculate_regression_status(self, signals_detected: Optional[Dict]) -> str:
        """Calculate regression status based on signals"""
        if not signals_detected:
            return "safe"
        
        status = signals_detected.get("status")
        if status:
            return status
        
        critical_count = signals_detected.get("critical_count", 0)
        high_count = signals_detected.get("high_count", 0)
        signal_count = signals_detected.get("signal_count", 0)
        
        if critical_count > 0:
            return "critical"
        if high_count >= 2:
            return "critical"
        if high_count > 0 or signal_count >= 3:
            return "regressed"
        
        return "safe"
    
    # Comments
    
    def add_comment(self, review_id: int, user_id: int, content: str):
        """Add a comment to a review"""
        _, ReviewComment, _ = self._get_models()
        
        comment = ReviewComment(
            review_id=review_id,
            user_id=user_id,
            content=content,
            is_system=False,
        )
        
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(comment)
        return comment
    
    def _add_system_comment(self, review_id: int, content: str):
        """Add a system comment to a review"""
        _, ReviewComment, _ = self._get_models()
        
        comment = ReviewComment(
            review_id=review_id,
            user_id=None,
            content=content,
            is_system=True,
        )
        
        self.db.add(comment)
        self.db.commit()
        return comment
    
    def get_comments(self, review_id: int) -> List:
        """Get all comments for a review"""
        _, ReviewComment, _ = self._get_models()
        return self.db.query(ReviewComment).filter(
            ReviewComment.review_id == review_id
        ).order_by(ReviewComment.created_at).all()
    
    # Review Cases
    
    def add_review_case(
        self,
        review_id: int,
        prompt: str,
        snapshot_id: Optional[int] = None,
        test_result_id: Optional[str] = None,
        response_before: Optional[str] = None,
        response_after: Optional[str] = None,
        signals: Optional[Dict] = None,
        status: str = "pending",
    ):
        """Add a test case to a review"""
        _, _, ReviewCase = self._get_models()
        
        case = ReviewCase(
            review_id=review_id,
            snapshot_id=snapshot_id,
            test_result_id=test_result_id,
            prompt=prompt,
            response_before=response_before,
            response_after=response_after,
            signals=signals,
            status=status,
        )
        
        self.db.add(case)
        self.db.commit()
        self.db.refresh(case)
        return case
    
    def get_review_cases(self, review_id: int, status: Optional[str] = None) -> List:
        """Get all cases for a review"""
        _, _, ReviewCase = self._get_models()
        
        query = self.db.query(ReviewCase).filter(
            ReviewCase.review_id == review_id
        )
        
        if status:
            query = query.filter(ReviewCase.status == status)
        
        return query.all()
    
    def update_case_status(
        self,
        case_id: int,
        status: str,
        reviewer_note: Optional[str] = None
    ):
        """Update a case's status (manual override)"""
        _, _, ReviewCase = self._get_models()
        
        case = self.db.query(ReviewCase).filter(
            ReviewCase.id == case_id
        ).first()
        
        if not case:
            return None
        
        case.status = status
        case.manually_reviewed = True
        case.manual_status = status
        if reviewer_note:
            case.reviewer_note = reviewer_note
        
        self.db.commit()
        self.db.refresh(case)
        return case
    
    def get_review_stats(self, project_id: int) -> Dict[str, Any]:
        """Get review statistics for a project"""
        Review, _, _ = self._get_models()
        
        total = self.db.query(Review).filter(
            Review.project_id == project_id
        ).count()
        
        pending = self.db.query(Review).filter(
            Review.project_id == project_id,
            Review.status == "pending"
        ).count()
        
        approved = self.db.query(Review).filter(
            Review.project_id == project_id,
            Review.status == "approved"
        ).count()
        
        rejected = self.db.query(Review).filter(
            Review.project_id == project_id,
            Review.status == "rejected"
        ).count()
        
        safe = self.db.query(Review).filter(
            Review.project_id == project_id,
            Review.regression_status == "safe"
        ).count()
        
        regressed = self.db.query(Review).filter(
            Review.project_id == project_id,
            Review.regression_status == "regressed"
        ).count()
        
        critical = self.db.query(Review).filter(
            Review.project_id == project_id,
            Review.regression_status == "critical"
        ).count()
        
        return {
            "total": total,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "needs_discussion": self.db.query(Review).filter(
                Review.project_id == project_id,
                Review.status == "needs_discussion"
            ).count(),
            "by_regression_status": {
                "safe": safe,
                "regressed": regressed,
                "critical": critical,
            }
        }

    def create_review_from_signal(
        self,
        *,
        project_id: int,
        origin: str,
        title: str,
        description: Optional[str],
        items: List[Dict[str, Any]],
        replay_id: Optional[int] = None,
        test_run_id: Optional[str] = None,
    ):
        """
        Create a Review (and ReviewCases) from individual signal results.

        Each item in ``items`` should include:
        - ``signal_result``: SignalEngine result dict.
        - ``prompt``: Prompt text for the case.
        - ``response`` or ``response_after``: Output text under review.
        - Optional ``response_before``: Baseline/original output.
        - Optional ``snapshot_id``: When originating from Live View / Replay.
        - Optional ``test_result_id``: When originating from Test Lab.
        """
        if not items:
            return None

        # Aggregate signal summary across all items
        status_priority = {"safe": 0, "needs_review": 1, "critical": 2}
        aggregate_status = "safe"
        total_signal_count = 0
        total_critical = 0
        total_high = 0

        for item in items:
            signals = item.get("signal_result") or {}
            status = signals.get("status") or "safe"
            if status_priority.get(status, 0) > status_priority.get(aggregate_status, 0):
                aggregate_status = status
            total_signal_count += signals.get("signal_count", 0)
            total_critical += signals.get("critical_count", 0)
            total_high += signals.get("high_count", 0)

        signals_detected = {
            "status": aggregate_status,
            "signal_count": total_signal_count,
            "critical_count": total_critical,
            "high_count": total_high,
        }

        test_count = len(items)
        failed_count = len(
            [it for it in items if (it.get("signal_result") or {}).get("status") != "safe"]
        )
        passed_count = test_count - failed_count

        review = self.create_review(
            project_id=project_id,
            title=title,
            replay_id=replay_id,
            description=description,
            signals_detected=signals_detected,
            model_before=None,
            model_after=None,
            test_count=test_count,
            passed_count=passed_count,
            failed_count=failed_count,
            origin=origin,
            test_run_id=test_run_id,
        )

        # Create individual cases
        for item in items:
            signals = item.get("signal_result") or {}
            prompt = item.get("prompt") or ""
            response_before = item.get("response_before")
            response_after = item.get("response_after") or item.get("response")
            snapshot_id = item.get("snapshot_id")
            test_result_id = item.get("test_result_id")

            self.add_review_case(
                review_id=review.id,
                prompt=prompt,
                snapshot_id=snapshot_id,
                test_result_id=test_result_id,
                response_before=response_before,
                response_after=response_after,
                signals=signals,
                status=signals.get("status", "pending"),
            )

        logger.info(
            "Created review %s from %d signal-bearing items (origin=%s)",
            review.id,
            len(items),
            origin,
        )
        return review
    
    def create_review_from_replay(
        self,
        project_id: int,
        replay_id: int,
        replay_results: Dict,
        model_before: str,
        model_after: str,
    ):
        """Create a review from replay results"""
        signals = replay_results.get("signals", {})
        results = replay_results.get("results", [])
        
        test_count = len(results)
        passed_count = len([r for r in results if r.get("status") == "passed"])
        failed_count = len([r for r in results if r.get("status") in ["failed", "flagged"]])
        
        review = self.create_review(
            project_id=project_id,
            title=f"Model Change: {model_before} → {model_after}",
            replay_id=replay_id,
            description=f"Replay comparing {model_before} to {model_after}",
            signals_detected=signals,
            model_before=model_before,
            model_after=model_after,
            test_count=test_count,
            passed_count=passed_count,
            failed_count=failed_count,
        )
        
        for result in results:
            self.add_review_case(
                review_id=review.id,
                prompt=result.get("prompt", ""),
                snapshot_id=result.get("snapshot_id"),
                response_before=result.get("response_before"),
                response_after=result.get("response_after"),
                signals=result.get("signals"),
                status=result.get("status", "pending"),
            )
        
        return review
