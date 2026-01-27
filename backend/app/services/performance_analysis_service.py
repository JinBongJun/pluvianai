"""
Performance Analysis Service for identifying performance bottlenecks
Analyzes latency data to find slow nodes
"""

from typing import Dict, Any, List
from datetime import datetime, timedelta
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import and_
from statistics import mean, median
from app.core.logging_config import logger
from app.models.api_call import APICall
from app.services.mapping_service import MappingService
from app.services.base_analysis_service import BaseAnalysisService


class PerformanceAnalysisService(BaseAnalysisService):
    """Service for analyzing performance bottlenecks"""

    def __init__(self, db: Session):
        self.db = db
        self.mapping_service = MappingService(db)

    def analyze(
        self,
        project_id: int,
        days: int = 7,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform performance analysis (implements BaseAnalysisService interface)
        """
        percentile_threshold = kwargs.get("percentile_threshold", 0.95)
        return self.analyze_performance(project_id, days, percentile_threshold)
    
    def analyze_performance(
        self,
        project_id: int,
        days: int = 7,
        percentile_threshold: float = 0.95
    ) -> Dict[str, Any]:
        """
        Analyze performance bottlenecks based on latency
        
        Args:
            project_id: Project ID
            days: Number of days to analyze
            percentile_threshold: Percentile threshold for bottleneck detection (default: 95th percentile)
        
        Returns:
            Dict with bottleneck nodes and analysis results
        """
        logger.info(
            f"Analyzing performance for project {project_id}",
            extra={"project_id": project_id, "days": days, "percentile_threshold": percentile_threshold}
        )

        # Get agent structure
        structure = self.mapping_service.analyze_agent_structure(project_id, days)

        # Get latency data for all nodes
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get API calls with latency data
        api_calls = (
            self.db.query(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date,
                    APICall.latency_ms.isnot(None),
                    APICall.agent_name.isnot(None)
                )
            )
            .all()
        )

        # Group by agent and calculate statistics
        agent_latencies: Dict[str, List[float]] = defaultdict(list)
        for call in api_calls:
            if call.agent_name and call.latency_ms:
                agent_latencies[call.agent_name].append(call.latency_ms)

        # Calculate statistics for each agent
        node_stats: Dict[str, Dict[str, float]] = {}
        all_latencies: List[float] = []

        for agent_name, latencies in agent_latencies.items():
            if len(latencies) > 0:
                sorted_latencies = sorted(latencies)
                node_stats[agent_name] = {
                    "avg": mean(sorted_latencies),
                    "median": median(sorted_latencies),
                    "p95": sorted_latencies[int(len(sorted_latencies) * percentile_threshold)] if len(sorted_latencies) > 0 else 0,
                    "p99": sorted_latencies[int(len(sorted_latencies) * 0.99)] if len(sorted_latencies) > 0 else 0,
                    "min": min(sorted_latencies),
                    "max": max(sorted_latencies),
                    "count": len(sorted_latencies),
                }
                all_latencies.extend(sorted_latencies)

        # Calculate global statistics
        global_stats = {}
        if all_latencies:
            sorted_all = sorted(all_latencies)
            global_stats = {
                "avg": mean(sorted_all),
                "median": median(sorted_all),
                "p95": sorted_all[int(len(sorted_all) * percentile_threshold)] if len(sorted_all) > 0 else 0,
                "p99": sorted_all[int(len(sorted_all) * 0.99)] if len(sorted_all) > 0 else 0,
            }

        # Identify bottlenecks (nodes with latency > 1.5x of global P95)
        bottleneck_nodes: List[Dict[str, Any]] = []
        threshold = global_stats.get("p95", global_stats.get("avg", 0)) * 1.5  # 1.5x of P95

        for node in structure["nodes"]:
            node_id = node["id"]
            if node_id in node_stats:
                stats = node_stats[node_id]
                node_latency = stats["p95"]  # Use P95 as representative latency

                if node_latency > threshold:
                    bottleneck_nodes.append({
                        **node,
                        "latency_stats": stats,
                        "bottleneck_reason": f"P95 latency ({node_latency:.0f}ms) exceeds threshold ({threshold:.0f}ms)",
                        "severity": self._calculate_bottleneck_severity(node_latency, threshold),
                    })

        # Sort by severity (most severe first)
        bottleneck_nodes.sort(key=lambda n: n["severity"], reverse=True)

        result = {
            "project_id": project_id,
            "analysis_date": datetime.utcnow().isoformat(),
            "total_nodes": len(structure["nodes"]),
            "bottleneck_nodes": bottleneck_nodes,
            "bottleneck_count": len(bottleneck_nodes),
            "global_stats": global_stats,
            "threshold": threshold,
            "metadata": {
                "days_analyzed": days,
                "percentile_threshold": percentile_threshold,
                "structure": structure,
            }
        }

        logger.info(
            f"Performance analysis completed: {len(bottleneck_nodes)} bottlenecks found",
            extra={"project_id": project_id, "bottleneck_count": len(bottleneck_nodes)}
        )

        return result

    def _calculate_bottleneck_severity(self, latency: float, threshold: float) -> float:
        """
        Calculate bottleneck severity (0-1, higher = more severe)
        
        Args:
            latency: Node latency
            threshold: Threshold latency
        
        Returns:
            Severity score
        """
        if latency <= threshold:
            return 0.0

        # Severity increases with how much latency exceeds threshold
        excess = latency - threshold
        severity = min(1.0, excess / threshold)  # Normalize to 0-1
        return severity
