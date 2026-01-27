"""
Dependency Analysis Service for analyzing agent dependencies
Uses Auto-Mapping Service to build dependency graphs
"""

from typing import Dict, Any, List
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.logging_config import logger
from app.services.mapping_service import MappingService
from app.services.base_analysis_service import BaseAnalysisService


class DependencyAnalysisService(BaseAnalysisService):
    """Service for analyzing agent dependencies"""

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
        Perform dependency analysis (implements BaseAnalysisService interface)
        """
        return self.analyze_dependencies(project_id, days)
    
    def analyze_dependencies(
        self,
        project_id: int,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Analyze agent dependencies from Snapshot data
        
        Args:
            project_id: Project ID
            days: Number of days to analyze
        
        Returns:
            Dict with dependency graph and analysis
        """
        logger.info(
            f"Analyzing dependencies for project {project_id}",
            extra={"project_id": project_id, "days": days}
        )

        # Build dependency graph using mapping service
        graph = self.mapping_service.build_dependency_graph(project_id, days)

        # Analyze dependencies
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        # Build dependency map (which agents depend on which)
        dependency_map: Dict[str, List[str]] = {}
        dependents_map: Dict[str, List[str]] = {}

        for edge in edges:
            from_node = edge["from"]
            to_node = edge["to"]

            # to_node depends on from_node
            if to_node not in dependency_map:
                dependency_map[to_node] = []
            dependency_map[to_node].append(from_node)

            # from_node has dependents
            if from_node not in dependents_map:
                dependents_map[from_node] = []
            dependents_map[from_node].append(to_node)

        # Calculate dependency depth for each node
        node_depths: Dict[str, int] = {}
        for node in nodes:
            node_id = node["id"]
            depth = self._calculate_dependency_depth(node_id, dependency_map, set())
            node_depths[node_id] = depth

        # Find root nodes (no dependencies)
        root_nodes = [node for node in nodes if node["id"] not in dependency_map]

        # Find leaf nodes (no dependents)
        leaf_nodes = [node for node in nodes if node["id"] not in dependents_map]

        result = {
            "project_id": project_id,
            "analysis_date": datetime.utcnow().isoformat(),
            "dependency_graph": graph,
            "dependency_map": dependency_map,
            "dependents_map": dependents_map,
            "node_depths": node_depths,
            "root_nodes": [n["id"] for n in root_nodes],
            "leaf_nodes": [n["id"] for n in leaf_nodes],
            "metadata": {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "days_analyzed": days,
            }
        }

        logger.info(
            f"Dependency analysis completed: {len(nodes)} nodes, {len(edges)} dependencies",
            extra={"project_id": project_id, "node_count": len(nodes), "edge_count": len(edges)}
        )

        return result

    def _calculate_dependency_depth(
        self,
        node_id: str,
        dependency_map: Dict[str, List[str]],
        visited: set
    ) -> int:
        """
        Calculate maximum dependency depth for a node
        
        Args:
            node_id: Node ID
            dependency_map: Map of node to its dependencies
            visited: Set of visited nodes (for cycle detection)
        
        Returns:
            Maximum depth
        """
        if node_id in visited:
            # Cycle detected, return 0 to avoid infinite recursion
            return 0

        if node_id not in dependency_map or len(dependency_map[node_id]) == 0:
            # No dependencies, depth is 0
            return 0

        visited.add(node_id)
        max_depth = 0
        for dep in dependency_map[node_id]:
            depth = self._calculate_dependency_depth(dep, dependency_map, visited.copy())
            max_depth = max(max_depth, depth)
        visited.remove(node_id)

        return max_depth + 1
