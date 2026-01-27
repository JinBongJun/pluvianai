"""
Detailed Analysis Service for providing detailed failure case information
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.core.logging_config import logger
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.models.quality_score import QualityScore
from app.services.base_analysis_service import BaseAnalysisService


class DetailedAnalysisService(BaseAnalysisService):
    """Service for providing detailed analysis of failed cases"""

    def __init__(self, db: Session):
        self.db = db

    def analyze(
        self,
        project_id: int,
        days: int = 7,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform detailed analysis (implements BaseAnalysisService interface)
        """
        min_score = kwargs.get("min_score", 3.0)
        failed_cases = self.get_failed_cases(project_id, days, min_score)
        metadata = self._get_common_metadata(project_id, days, min_score=min_score)
        return {
            "project_id": project_id,
            "analysis_date": metadata["analysis_date"],
            "analysis_type": "detailed",
            "results": {
                "failed_cases": failed_cases,
                "failed_count": len(failed_cases)
            },
            "metadata": metadata
        }
    
    def get_failed_cases(
        self,
        project_id: int,
        days: int = 7,
        min_score: float = 3.0
    ) -> List[Dict[str, Any]]:
        """
        Get detailed information about failed cases
        
        Args:
            project_id: Project ID
            days: Number of days to analyze
            min_score: Minimum score threshold (cases below this are considered failures)
        
        Returns:
            List of failed cases with detailed information
        """
        logger.info(
            f"Getting failed cases for project {project_id}",
            extra={"project_id": project_id, "days": days, "min_score": min_score}
        )

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get quality scores below threshold
        failed_scores = (
            self.db.query(QualityScore)
            .join(Snapshot)
            .join(Trace)
            .filter(
                and_(
                    Trace.project_id == project_id,
                    QualityScore.created_at >= start_date,
                    QualityScore.created_at <= end_date,
                    QualityScore.overall_score < min_score
                )
            )
            .order_by(QualityScore.overall_score.asc())
            .limit(100)
            .all()
        )

        failed_cases = []
        for score in failed_scores:
            # Get snapshot
            snapshot = (
                self.db.query(Snapshot)
                .filter(Snapshot.id == score.api_call_id)
                .first()
            )

            if snapshot:
                case = {
                    "snapshot_id": snapshot.id,
                    "score": score.overall_score,
                    "timestamp": snapshot.created_at.isoformat() if snapshot.created_at else None,
                    "provider": snapshot.provider,
                    "model": snapshot.model,
                    "failure_reasons": self._extract_failure_reasons(score),
                    "snapshot_data": {
                        "payload": snapshot.payload,
                        "status_code": snapshot.status_code,
                    }
                }
                failed_cases.append(case)

        logger.info(
            f"Found {len(failed_cases)} failed cases",
            extra={"project_id": project_id, "failed_count": len(failed_cases)}
        )

        return failed_cases

    def get_case_details(
        self,
        snapshot_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a specific case
        
        Args:
            snapshot_id: Snapshot ID
        
        Returns:
            Detailed case information
        """
        snapshot = self.db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()
        if not snapshot:
            return None

        # Get quality score if available
        quality_score = (
            self.db.query(QualityScore)
            .filter(QualityScore.api_call_id == snapshot_id)
            .first()
        )

        return {
            "snapshot_id": snapshot.id,
            "provider": snapshot.provider,
            "model": snapshot.model,
            "payload": snapshot.payload,
            "status_code": snapshot.status_code,
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "quality_score": {
                "overall_score": quality_score.overall_score if quality_score else None,
                "semantic_consistency": quality_score.semantic_consistency_score if quality_score else None,
                "tone_score": quality_score.tone_score if quality_score else None,
                "coherence_score": quality_score.coherence_score if quality_score else None,
                "violations": quality_score.violations if quality_score else None,
            } if quality_score else None,
        }

    def _extract_failure_reasons(self, score: QualityScore) -> List[str]:
        """Extract failure reasons from quality score"""
        reasons = []

        if score.overall_score < 3.0:
            reasons.append(f"Low overall score: {score.overall_score:.1f}/5.0")

        if score.semantic_consistency_score and score.semantic_consistency_score < 60:
            reasons.append(f"Low semantic consistency: {score.semantic_consistency_score:.1f}/100")

        if score.violations:
            reasons.append(f"Violations: {len(score.violations)} issues found")

        if score.json_valid is False:
            reasons.append("Invalid JSON format")

        if score.required_fields_present is False:
            reasons.append("Required fields missing")

        return reasons
