"""
Mapping Service for Auto-Mapping agent structures
Analyzes Trace/Snapshot data to build dependency graphs and agent structures
"""

from typing import Dict, Any, List, Optional, Set
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from collections import defaultdict
from app.core.logging_config import logger
from app.models.trace import Trace
from app.models.snapshot import Snapshot
from app.models.api_call import APICall
from app.models.quality_score import QualityScore


class MappingService:
    """Service for analyzing agent structures and building dependency graphs"""

    def __init__(self, db: Session):
        self.db = db

    def analyze_agent_structure(
        self,
        project_id: int,
        days: int = 7,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Analyze agent structure from Trace/Snapshot data
        
        Args:
            project_id: Project ID
            days: Number of days to analyze (default: 7)
            filters: Optional filters (agent_name, min_score, max_latency, etc.)
        
        Returns:
            Dict with nodes and edges representing agent structure
        """
        logger.info(
            f"Analyzing agent structure for project {project_id}",
            extra={"project_id": project_id, "days": days, "filters": filters}
        )

        # Get time range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get all traces for the project
        traces = (
            self.db.query(Trace)
            .filter(
                and_(
                    Trace.project_id == project_id,
                    Trace.created_at >= start_date,
                    Trace.created_at <= end_date
                )
            )
            .all()
        )

        # Build node and edge data
        nodes: Dict[str, Dict[str, Any]] = {}
        edges: Dict[str, Dict[str, Any]] = {}
        node_metrics: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "call_count": 0,
            "total_latency": 0.0,
            "total_score": 0.0,
            "score_count": 0,
            "success_count": 0,
            "error_count": 0,
        })

        # Process traces and snapshots
        for trace in traces:
            snapshots = (
                self.db.query(Snapshot)
                .filter(Snapshot.trace_id == trace.id)
                .order_by(Snapshot.created_at.asc())
                .all()
            )

            # Extract agent names from snapshots
            # Agent name can be in payload metadata or we can infer from model/provider
            previous_agent = None
            for snapshot in snapshots:
                agent_name = self._extract_agent_name(snapshot)
                if not agent_name:
                    # Fallback: use provider/model as agent identifier
                    agent_name = f"{snapshot.provider}/{snapshot.model}"

                # Create or update node
                if agent_name not in nodes:
                    nodes[agent_name] = {
                        "id": agent_name,
                        "name": agent_name,
                        "type": "agent",
                        "provider": snapshot.provider,
                        "model": snapshot.model,
                    }

                # Update metrics
                node_metrics[agent_name]["call_count"] += 1
                if snapshot.status_code and 200 <= snapshot.status_code < 300:
                    node_metrics[agent_name]["success_count"] += 1
                else:
                    node_metrics[agent_name]["error_count"] += 1

                # Create edge from previous agent to current
                if previous_agent and previous_agent != agent_name:
                    edge_key = f"{previous_agent}->{agent_name}"
                    if edge_key not in edges:
                        edges[edge_key] = {
                            "from": previous_agent,
                            "to": agent_name,
                            "call_count": 0,
                            "avg_latency": 0.0,
                        }
                    edges[edge_key]["call_count"] += 1

                previous_agent = agent_name

        # Get additional metrics from APICall and QualityScore
        self._enrich_node_metrics(project_id, nodes, node_metrics, start_date, end_date, filters)

        # Apply filters
        if filters:
            nodes, edges = self._apply_filters(nodes, edges, filters)

        # Build final structure
        result = {
            "nodes": [
                {
                    **node,
                    "metrics": {
                        "score": node_metrics[node["id"]]["total_score"] / max(node_metrics[node["id"]]["score_count"], 1),
                        "latency": node_metrics[node["id"]]["total_latency"] / max(node_metrics[node["id"]]["call_count"], 1),
                        "call_count": node_metrics[node["id"]]["call_count"],
                        "success_rate": node_metrics[node["id"]]["success_count"] / max(node_metrics[node["id"]]["call_count"], 1) if node_metrics[node["id"]]["call_count"] > 0 else 0.0,
                    }
                }
                for node in nodes.values()
            ],
            "edges": list(edges.values()),
            "metadata": {
                "project_id": project_id,
                "analyzed_days": days,
                "total_traces": len(traces),
                "total_nodes": len(nodes),
                "total_edges": len(edges),
            }
        }

        logger.info(
            f"Agent structure analysis completed: {len(nodes)} nodes, {len(edges)} edges",
            extra={"project_id": project_id, "node_count": len(nodes), "edge_count": len(edges)}
        )

        return result

    def build_dependency_graph(
        self,
        project_id: int,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Build dependency graph from chain_id relationships
        
        Args:
            project_id: Project ID
            days: Number of days to analyze
        
        Returns:
            Dependency graph with nodes and edges
        """
        logger.info(
            f"Building dependency graph for project {project_id}",
            extra={"project_id": project_id, "days": days}
        )

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get API calls with chain_id
        api_calls = (
            self.db.query(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date,
                    APICall.chain_id.isnot(None),
                    APICall.agent_name.isnot(None)
                )
            )
            .all()
        )

        # Group by chain_id to find dependencies
        chains: Dict[str, List[APICall]] = defaultdict(list)
        for call in api_calls:
            if call.chain_id:
                chains[call.chain_id].append(call)

        # Build dependency graph
        nodes: Dict[str, Dict[str, Any]] = {}
        edges: Dict[str, Dict[str, Any]] = {}

        for chain_id, calls in chains.items():
            # Sort calls by created_at to determine order
            sorted_calls = sorted(calls, key=lambda c: c.created_at)

            previous_agent = None
            for call in sorted_calls:
                agent_name = call.agent_name or f"{call.provider}/{call.model}"

                # Create node
                if agent_name not in nodes:
                    nodes[agent_name] = {
                        "id": agent_name,
                        "name": agent_name,
                        "type": "agent",
                        "provider": call.provider,
                        "model": call.model,
                    }

                # Create edge
                if previous_agent and previous_agent != agent_name:
                    edge_key = f"{previous_agent}->{agent_name}"
                    if edge_key not in edges:
                        edges[edge_key] = {
                            "from": previous_agent,
                            "to": agent_name,
                            "call_count": 0,
                            "avg_latency": 0.0,
                        }
                    edges[edge_key]["call_count"] += 1
                    if call.latency_ms:
                        current_avg = edges[edge_key]["avg_latency"]
                        count = edges[edge_key]["call_count"]
                        edges[edge_key]["avg_latency"] = (current_avg * (count - 1) + call.latency_ms) / count

                previous_agent = agent_name

        return {
            "nodes": list(nodes.values()),
            "edges": list(edges.values()),
            "metadata": {
                "project_id": project_id,
                "total_chains": len(chains),
                "total_nodes": len(nodes),
                "total_edges": len(edges),
            }
        }

    def get_node_metrics(
        self,
        project_id: int,
        node_id: str,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Get detailed metrics for a specific node
        
        Args:
            project_id: Project ID
            node_id: Node ID (agent name)
            days: Number of days to analyze
        
        Returns:
            Detailed metrics for the node
        """
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get API calls for this agent
        api_calls = (
            self.db.query(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.agent_name == node_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date
                )
            )
            .all()
        )

        if not api_calls:
            return {
                "node_id": node_id,
                "error": "Node not found or no data available"
            }

        # Calculate metrics
        total_calls = len(api_calls)
        total_latency = sum(c.latency_ms or 0 for c in api_calls)
        avg_latency = total_latency / total_calls if total_calls > 0 else 0.0
        success_count = sum(1 for c in api_calls if c.status_code and 200 <= c.status_code < 300)
        success_rate = success_count / total_calls if total_calls > 0 else 0.0

        # Get quality scores
        quality_scores = (
            self.db.query(QualityScore)
            .join(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.agent_name == node_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date
                )
            )
            .all()
        )

        avg_score = 0.0
        if quality_scores:
            avg_score = sum(q.overall_score for q in quality_scores) / len(quality_scores)

        # Get recent messages (from snapshots)
        recent_snapshots = (
            self.db.query(Snapshot)
            .join(Trace)
            .filter(
                and_(
                    Trace.project_id == project_id,
                    Snapshot.created_at >= start_date,
                    Snapshot.created_at <= end_date
                )
            )
            .order_by(Snapshot.created_at.desc())
            .limit(3)
            .all()
        )

        recent_messages = []
        for snapshot in recent_snapshots:
            # Extract message from payload
            payload = snapshot.payload or {}
            messages = payload.get("messages", [])
            if messages:
                # Get last user message
                for msg in reversed(messages):
                    if msg.get("role") == "user":
                        recent_messages.append({
                            "content": msg.get("content", "")[:200],  # Truncate
                            "timestamp": snapshot.created_at.isoformat() if snapshot.created_at else None
                        })
                        break

        return {
            "node_id": node_id,
            "metrics": {
                "call_count": total_calls,
                "avg_latency": avg_latency,
                "success_rate": success_rate,
                "avg_score": avg_score,
            },
            "recent_messages": recent_messages[:3],
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            }
        }

    def filter_nodes(
        self,
        project_id: int,
        filters: Dict[str, Any],
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Filter nodes based on criteria
        
        Args:
            project_id: Project ID
            filters: Filter criteria (agent_name, min_score, max_latency, has_problems, etc.)
            days: Number of days to analyze
        
        Returns:
            Filtered agent structure
        """
        # Get full structure
        structure = self.analyze_agent_structure(project_id, days, filters)

        # Apply additional filters
        filtered_nodes = []
        for node in structure["nodes"]:
            include = True

            # Filter by agent name
            if "agent_name" in filters:
                if filters["agent_name"].lower() not in node["name"].lower():
                    include = False

            # Filter by min score
            if "min_score" in filters:
                if node["metrics"]["score"] < filters["min_score"]:
                    include = False

            # Filter by max latency
            if "max_latency" in filters:
                if node["metrics"]["latency"] > filters["max_latency"]:
                    include = False

            # Filter by problems (low score or high error rate)
            if "has_problems" in filters and filters["has_problems"]:
                if node["metrics"]["score"] < 3.0 or node["metrics"]["success_rate"] < 0.9:
                    include = False

            if include:
                filtered_nodes.append(node)

        # Filter edges to only include filtered nodes
        node_ids = {node["id"] for node in filtered_nodes}
        filtered_edges = [
            edge for edge in structure["edges"]
            if edge["from"] in node_ids and edge["to"] in node_ids
        ]

        return {
            "nodes": filtered_nodes,
            "edges": filtered_edges,
            "metadata": {
                **structure["metadata"],
                "filtered_node_count": len(filtered_nodes),
                "filtered_edge_count": len(filtered_edges),
            }
        }

    def get_subgraph(
        self,
        project_id: int,
        focus_node_id: str,
        depth: int = 2,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Get subgraph focused on a specific node (Complexity Management)
        
        This method helps manage complexity in large agent structures by allowing
        users to focus on specific nodes and their neighbors, reducing visual clutter.
        
        Args:
            project_id: Project ID
            focus_node_id: Node to focus on
            depth: Depth of neighbors to include (1-5)
            days: Number of days to analyze
        
        Returns:
            Subgraph with focused node and neighbors, including traffic path highlighting
        """
        structure = self.analyze_agent_structure(project_id, days)

        # Build adjacency list (bidirectional for undirected graph)
        adjacency: Dict[str, Set[str]] = defaultdict(set)
        edge_data: Dict[str, Dict[str, Any]] = {}  # Store edge metadata
        
        for edge in structure["edges"]:
            from_node = edge["from"]
            to_node = edge["to"]
            adjacency[from_node].add(to_node)
            adjacency[to_node].add(from_node)
            # Store edge key for metadata lookup
            edge_key = f"{from_node}->{to_node}"
            edge_data[edge_key] = edge

        # BFS to find nodes within depth (Focus Mode)
        visited: Set[str] = {focus_node_id}
        queue = [(focus_node_id, 0)]
        included_nodes: Set[str] = {focus_node_id}
        node_depths: Dict[str, int] = {focus_node_id: 0}  # Track depth for each node

        while queue:
            current, current_depth = queue.pop(0)
            if current_depth < depth:
                for neighbor in adjacency.get(current, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        included_nodes.add(neighbor)
                        node_depths[neighbor] = current_depth + 1
                        queue.append((neighbor, current_depth + 1))

        # Filter nodes and edges
        filtered_nodes = [
            {
                **node,
                "depth": node_depths.get(node["id"], 0),
                "is_focus": node["id"] == focus_node_id,
            }
            for node in structure["nodes"]
            if node["id"] in included_nodes
        ]
        
        filtered_edges = [
            {
                **edge,
                "is_highlighted": (
                    edge["from"] == focus_node_id or edge["to"] == focus_node_id
                ),  # Highlight edges connected to focus node
            }
            for edge in structure["edges"]
            if edge["from"] in included_nodes and edge["to"] in included_nodes
        ]

        # Group nodes by depth for visualization
        nodes_by_depth: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        for node in filtered_nodes:
            nodes_by_depth[node["depth"]].append(node)

        return {
            "nodes": filtered_nodes,
            "edges": filtered_edges,
            "focus_node": focus_node_id,
            "depth": depth,
            "nodes_by_depth": dict(nodes_by_depth),  # Group nodes by depth
            "metadata": {
                "project_id": project_id,
                "total_nodes": len(filtered_nodes),
                "total_edges": len(filtered_edges),
                "original_total_nodes": structure["metadata"]["total_nodes"],
                "complexity_reduction": f"{((1 - len(filtered_nodes) / max(structure['metadata']['total_nodes'], 1)) * 100):.1f}%",
            }
        }

    def _extract_agent_name(self, snapshot: Snapshot) -> Optional[str]:
        """Extract agent name from snapshot payload"""
        payload = snapshot.payload or {}
        
        # Try to get from metadata
        metadata = payload.get("metadata", {})
        if isinstance(metadata, dict):
            agent_name = metadata.get("agent_name")
            if agent_name:
                return agent_name

        # Try to get from headers in payload
        headers = payload.get("headers", {})
        if isinstance(headers, dict):
            agent_name = headers.get("X-Agent-Name")
            if agent_name:
                return agent_name

        return None

    def _enrich_node_metrics(
        self,
        project_id: int,
        nodes: Dict[str, Dict[str, Any]],
        node_metrics: Dict[str, Dict[str, Any]],
        start_date: datetime,
        end_date: datetime,
        filters: Optional[Dict[str, Any]] = None
    ):
        """Enrich node metrics with APICall and QualityScore data"""
        # Get API calls for agents
        query = (
            self.db.query(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date,
                    APICall.agent_name.isnot(None)
                )
            )
        )

        if filters and "agent_name" in filters:
            query = query.filter(APICall.agent_name.ilike(f"%{filters['agent_name']}%"))

        api_calls = query.all()

        # Update metrics from API calls
        for call in api_calls:
            agent_name = call.agent_name
            if agent_name in node_metrics:
                if call.latency_ms:
                    node_metrics[agent_name]["total_latency"] += call.latency_ms
                if call.status_code and 200 <= call.status_code < 300:
                    node_metrics[agent_name]["success_count"] += 1
                else:
                    node_metrics[agent_name]["error_count"] += 1

        # Get quality scores
        quality_scores = (
            self.db.query(QualityScore)
            .join(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date,
                    APICall.agent_name.isnot(None)
                )
            )
            .all()
        )

        # Update scores
        for score in quality_scores:
            if score.api_call.agent_name:
                agent_name = score.api_call.agent_name
                if agent_name in node_metrics:
                    node_metrics[agent_name]["total_score"] += score.overall_score
                    node_metrics[agent_name]["score_count"] += 1

    def _apply_filters(
        self,
        nodes: Dict[str, Dict[str, Any]],
        edges: Dict[str, Dict[str, Any]],
        filters: Dict[str, Any]
    ) -> tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
        """Apply filters to nodes and edges"""
        filtered_nodes = nodes.copy()
        filtered_edges = edges.copy()

        # Filter by agent name
        if "agent_name" in filters:
            name_filter = filters["agent_name"].lower()
            filtered_nodes = {
                k: v for k, v in filtered_nodes.items()
                if name_filter in v["name"].lower()
            }

        # Filter by min score (will be applied after metrics calculation)
        # Filter by max latency (will be applied after metrics calculation)

        return filtered_nodes, filtered_edges
