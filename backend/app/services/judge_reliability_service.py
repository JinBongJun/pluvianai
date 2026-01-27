"""
Judge Reliability Service for alignment score calculation and meta-validation
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.judge_feedback import JudgeFeedback
from app.models.quality_score import QualityScore
from app.core.logging_config import logger


class JudgeReliabilityService:
    """Service for tracking and improving Judge reliability"""

    def calculate_alignment_score(self, judge_score: float, human_score: float) -> float:
        """
        Calculate alignment score between AI Judge and human scores
        
        Args:
            judge_score: AI Judge score (0-100)
            human_score: Human-provided score (0-100)
            
        Returns:
            Alignment score (0-100), where 100 is perfect alignment
        """
        # Calculate absolute difference
        diff = abs(judge_score - human_score)
        
        # Convert to alignment score (inverse of difference)
        # Max difference is 100, so alignment = 100 - diff
        alignment = max(0, 100 - diff)
        
        return round(alignment, 2)

    def get_average_alignment_score(
        self,
        project_id: int,
        db: Session,
        days: int = 30
    ) -> Optional[float]:
        """
        Get average alignment score for a project
        
        Args:
            project_id: Project ID
            db: Database session
            days: Number of days to look back
            
        Returns:
            Average alignment score or None if no data
        """
        from datetime import datetime, timedelta
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        result = (
            db.query(func.avg(JudgeFeedback.alignment_score))
            .filter(
                and_(
                    JudgeFeedback.project_id == project_id,
                    JudgeFeedback.created_at >= start_date,
                    JudgeFeedback.alignment_score.isnot(None)
                )
            )
            .scalar()
        )
        
        return round(result, 2) if result else None

    def get_judge_reliability_metrics(
        self,
        project_id: int,
        db: Session,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get comprehensive Judge reliability metrics
        
        Args:
            project_id: Project ID
            db: Database session
            days: Number of days to look back
            
        Returns:
            Dictionary with reliability metrics
        """
        from datetime import datetime, timedelta
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Get all feedback in period
        feedbacks = (
            db.query(JudgeFeedback)
            .filter(
                and_(
                    JudgeFeedback.project_id == project_id,
                    JudgeFeedback.created_at >= start_date
                )
            )
            .all()
        )
        
        if not feedbacks:
            return {
                "total_feedbacks": 0,
                "average_alignment": None,
                "reliability_score": None,
            }
        
        # Calculate metrics
        alignment_scores = [f.alignment_score for f in feedbacks if f.alignment_score is not None]
        avg_alignment = sum(alignment_scores) / len(alignment_scores) if alignment_scores else None
        
        # Reliability score is based on average alignment
        reliability_score = avg_alignment if avg_alignment else None
        
        return {
            "total_feedbacks": len(feedbacks),
            "average_alignment": round(avg_alignment, 2) if avg_alignment else None,
            "reliability_score": round(reliability_score, 2) if reliability_score else None,
            "feedbacks_with_alignment": len(alignment_scores),
        }

    async def run_meta_validation(
        self,
        evaluation_id: int,
        primary_judge_model: str,
        secondary_judge_model: str,
        db: Session,
        user_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Run meta-validation using a different Judge model
        
        Args:
            evaluation_id: QualityScore ID to validate
            primary_judge_model: Primary Judge model used (e.g., "gpt-4o-mini")
            secondary_judge_model: Secondary Judge model for validation (e.g., "claude-3-5-sonnet")
            db: Database session
            user_api_key: Optional user API key for secondary judge
            
        Returns:
            Meta-validation result with consistency check
        """
        # Get the original evaluation
        evaluation = db.query(QualityScore).filter(QualityScore.id == evaluation_id).first()
        if not evaluation:
            raise ValueError(f"Evaluation {evaluation_id} not found")
        
        # Get the API call and snapshot data
        from app.models.api_call import APICall
        from app.models.snapshot import Snapshot
        from app.models.trace import Trace
        
        api_call = db.query(APICall).filter(APICall.id == evaluation.api_call_id).first()
        if not api_call:
            raise ValueError(f"API call for evaluation {evaluation_id} not found")
        
        # Get original and replayed outputs from snapshot
        # QualityScore typically has snapshot_id or we can get it from trace
        trace = db.query(Trace).filter(Trace.id == api_call.trace_id).first() if api_call.trace_id else None
        if not trace:
            raise ValueError(f"Trace for API call {api_call.id} not found")
        
        # Get original snapshot (first snapshot in trace)
        original_snapshot = db.query(Snapshot).filter(
            Snapshot.trace_id == trace.id
        ).order_by(Snapshot.created_at.asc()).first()
        
        # Get replayed snapshot (latest snapshot in trace, or use evaluation data)
        replayed_snapshot = db.query(Snapshot).filter(
            Snapshot.trace_id == trace.id
        ).order_by(Snapshot.created_at.desc()).first()
        
        if not original_snapshot or not replayed_snapshot:
            raise ValueError(f"Snapshots not found for trace {trace.id}")
        
        # Extract outputs from snapshots
        original_output = original_snapshot.response_data.get("content", "") if isinstance(original_snapshot.response_data, dict) else str(original_snapshot.response_data)
        replayed_output = replayed_snapshot.response_data.get("content", "") if isinstance(replayed_snapshot.response_data, dict) else str(replayed_snapshot.response_data)
        
        # Get rubric used in original evaluation
        from app.models.evaluation_rubric import EvaluationRubric
        rubric = db.query(EvaluationRubric).filter(EvaluationRubric.id == evaluation.rubric_id).first()
        if not rubric:
            raise ValueError(f"Rubric for evaluation {evaluation_id} not found")
        
        # Run secondary Judge evaluation using JudgeService
        from app.services.judge_service import judge_service
        
        # Determine provider based on secondary model
        if "claude" in secondary_judge_model.lower() or "anthropic" in secondary_judge_model.lower():
            # For Anthropic, we'd need to implement Anthropic client
            # For now, fall back to OpenAI with a different model
            logger.warning(f"Anthropic models not yet supported, using OpenAI model instead")
            secondary_judge_model = "gpt-4o-mini"  # Fallback
        
        try:
            secondary_result = await judge_service.evaluate_response(
                original_output=original_output,
                replayed_output=replayed_output,
                rubric=rubric,
                judge_model=secondary_judge_model,
                user_api_key=user_api_key
            )
            
            # Extract secondary score from result
            if "error" in secondary_result:
                logger.error(f"Secondary Judge evaluation failed: {secondary_result.get('error')}")
                # Fallback to primary score if secondary fails
                secondary_score = evaluation.overall_score
            else:
                # Use replayed_score from secondary judge
                secondary_score = secondary_result.get("replayed_score", evaluation.overall_score)
        except Exception as e:
            logger.error(f"Meta-validation failed: {str(e)}")
            # Fallback to primary score
            secondary_score = evaluation.overall_score
        
        # Calculate consistency
        primary_score = evaluation.overall_score
        score_diff = abs(primary_score - secondary_score)
        is_consistent = score_diff < 10  # Consider consistent if difference < 10 points
        
        return {
            "evaluation_id": evaluation_id,
            "primary_judge_model": primary_judge_model,
            "secondary_judge_model": secondary_judge_model,
            "primary_score": primary_score,
            "secondary_score": secondary_score,
            "score_difference": round(score_diff, 2),
            "is_consistent": is_consistent,
            "consistency_threshold": 10,
            "meta_validation_success": "error" not in secondary_result if "secondary_result" in locals() else False,
        }


# Singleton instance
judge_reliability_service = JudgeReliabilityService()
