"""
Problem Analysis Service for identifying problem nodes
Combines Auto-Mapping with Judge scores to identify problematic agents
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from app.core.logging_config import logger
from app.models.quality_score import QualityScore
from app.models.api_call import APICall
from app.services.mapping_service import MappingService
from app.services.judge_service import JudgeService
from app.services.base_analysis_service import BaseAnalysisService


class ProblemAnalysisService(BaseAnalysisService):
    """Service for analyzing problems in agent structures"""

    def __init__(self, db: Session):
        self.db = db
        self.mapping_service = MappingService(db)
        self.judge_service = JudgeService()

    def analyze(
        self,
        project_id: int,
        days: int = 7,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform problem analysis (implements BaseAnalysisService interface)
        """
        threshold_score = kwargs.get("threshold_score", 3.0)
        return self.analyze_problems(project_id, days, threshold_score)
    
    def analyze_problems(
        self,
        project_id: int,
        days: int = 7,
        threshold_score: float = 3.0
    ) -> Dict[str, Any]:
        """
        Analyze problems in agent structure based on Judge scores
        
        Args:
            project_id: Project ID
            days: Number of days to analyze
            threshold_score: Score threshold below which a node is considered problematic
        
        Returns:
            Dict with problem nodes and analysis results
        """
        logger.info(
            f"Analyzing problems for project {project_id}",
            extra={"project_id": project_id, "days": days, "threshold_score": threshold_score}
        )

        # Get agent structure
        structure = self.mapping_service.analyze_agent_structure(project_id, days)

        # Identify problem nodes
        problem_nodes: List[Dict[str, Any]] = []
        for node in structure["nodes"]:
            metrics = node.get("metrics", {})
            score = metrics.get("score", 0)
            success_rate = metrics.get("success_rate", 1.0)

            # Check if node has problems
            has_problem = False
            problem_reasons = []

            if score < threshold_score:
                has_problem = True
                problem_reasons.append(f"Low score: {score:.1f}/5.0")

            if success_rate < 0.9:
                has_problem = True
                problem_reasons.append(f"Low success rate: {success_rate * 100:.1f}%")

            if has_problem:
                problem_nodes.append({
                    **node,
                    "problem_reasons": problem_reasons,
                    "severity": self._calculate_severity(score, success_rate),
                })

        # Sort by severity (most severe first)
        problem_nodes.sort(key=lambda n: n["severity"], reverse=True)

        # Get detailed analysis for each problem node
        for node in problem_nodes:
            node_details = self.mapping_service.get_node_metrics(project_id, node["id"], days)
            node["details"] = node_details

        result = {
            "project_id": project_id,
            "analysis_date": datetime.utcnow().isoformat(),
            "total_nodes": len(structure["nodes"]),
            "problem_nodes": problem_nodes,
            "problem_count": len(problem_nodes),
            "metadata": {
                "days_analyzed": days,
                "threshold_score": threshold_score,
                "structure": structure,
            }
        }

        logger.info(
            f"Problem analysis completed: {len(problem_nodes)} problem nodes found",
            extra={"project_id": project_id, "problem_count": len(problem_nodes)}
        )

        return result

    def get_problem_nodes(
        self,
        project_id: int,
        days: int = 7,
        threshold_score: float = 3.0
    ) -> List[Dict[str, Any]]:
        """
        Get list of problem nodes
        
        Args:
            project_id: Project ID
            days: Number of days to analyze
            threshold_score: Score threshold
        
        Returns:
            List of problem nodes
        """
        analysis = self.analyze_problems(project_id, days, threshold_score)
        return analysis["problem_nodes"]

    def _calculate_severity(self, score: float, success_rate: float) -> float:
        """
        Calculate problem severity (0-1, higher = more severe)
        
        Args:
            score: Average quality score
            success_rate: Success rate
        
        Returns:
            Severity score
        """
        # Normalize score to 0-1 (inverted: lower score = higher severity)
        score_severity = max(0, (5.0 - score) / 5.0)
        
        # Normalize success rate to 0-1 (inverted: lower rate = higher severity)
        rate_severity = max(0, (1.0 - success_rate))

        # Weighted average (score is more important)
        severity = (score_severity * 0.7) + (rate_severity * 0.3)
        return min(1.0, severity)
