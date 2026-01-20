"""
Agent Chain Profiler for multi-agent pipeline analysis
"""
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from collections import defaultdict
from app.models.api_call import APICall
from app.models.quality_score import QualityScore


class AgentChainProfiler:
    """Profile and analyze multi-agent pipelines"""
    
    def profile_chain(
        self,
        project_id: int,
        chain_id: Optional[str] = None,
        days: int = 7,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Profile an agent chain
        
        Args:
            project_id: Project ID
            chain_id: Optional chain ID to filter by
            days: Number of days to analyze
            db: Database session
        
        Returns:
            Dictionary with chain profiling data
        """
        if not db:
            raise ValueError("Database session required")
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Build query with optimized loading
        # Use joinedload to prevent N+1 queries when accessing relationships
        from sqlalchemy.orm import joinedload
        
        query = db.query(APICall).options(
            joinedload(APICall.quality_scores)  # Eager load quality scores
        ).filter(
            and_(
                APICall.project_id == project_id,
                APICall.created_at >= start_date,
                APICall.created_at <= end_date,
                APICall.chain_id.isnot(None),  # Only chain calls
            )
        )
        
        if chain_id:
            query = query.filter(APICall.chain_id == chain_id)
        
        # Order by created_at for consistent results
        query = query.order_by(APICall.created_at.desc())
        
        api_calls = query.all()
        
        if not api_calls:
            return {
                "message": "No chain data available",
                "chains": [],
            }
        
        # Group by chain_id
        chains: Dict[str, List[APICall]] = defaultdict(list)
        for call in api_calls:
            if call.chain_id:
                chains[call.chain_id].append(call)
        
        # Analyze each chain
        chain_profiles = []
        for chain_id, calls in chains.items():
            profile = self._analyze_chain(chain_id, calls, db)
            chain_profiles.append(profile)
        
        # Aggregate statistics
        total_chains = len(chain_profiles)
        successful_chains = sum(1 for p in chain_profiles if p["success_rate"] == 100.0)
        avg_chain_latency = sum(p["total_latency"] for p in chain_profiles) / total_chains if total_chains > 0 else 0.0
        
        return {
            "total_chains": total_chains,
            "successful_chains": successful_chains,
            "success_rate": (successful_chains / total_chains * 100) if total_chains > 0 else 0.0,
            "avg_chain_latency_ms": avg_chain_latency,
            "chains": chain_profiles,
        }
    
    def _analyze_chain(
        self,
        chain_id: str,
        calls: List[APICall],
        db: Session
    ) -> Dict[str, Any]:
        """Analyze a single chain"""
        # Sort calls by timestamp
        calls.sort(key=lambda c: c.created_at)
        
        # Group by agent
        agents: Dict[str, List[APICall]] = defaultdict(list)
        for call in calls:
            if call.agent_name:
                agents[call.agent_name].append(call)
        
        # Analyze each agent
        agent_stats = []
        total_latency = 0.0
        total_cost = 0.0
        failures = 0
        
        for agent_name, agent_calls in agents.items():
            agent_latency = sum(c.latency_ms or 0 for c in agent_calls)
            agent_failures = sum(1 for c in agent_calls if c.status_code and c.status_code >= 400)
            
            # Get quality scores for this agent
            # Quality scores are already loaded via joinedload, so access directly
            quality_scores = []
            for call in agent_calls:
                # Access quality_scores relationship (already loaded)
                if hasattr(call, 'quality_scores') and call.quality_scores:
                    quality_scores.extend([s.overall_score for s in call.quality_scores])
                else:
                    # Fallback: query if not loaded
                    scores = db.query(QualityScore).filter(
                        QualityScore.api_call_id == call.id
                    ).all()
                    quality_scores.extend([s.overall_score for s in scores])
            
            avg_quality = (
                sum(quality_scores) / len(quality_scores)
                if quality_scores else 0.0
            )
            
            agent_stats.append({
                "agent_name": agent_name,
                "call_count": len(agent_calls),
                "total_latency_ms": agent_latency,
                "avg_latency_ms": agent_latency / len(agent_calls) if agent_calls else 0.0,
                "failure_count": agent_failures,
                "failure_rate": (agent_failures / len(agent_calls) * 100) if agent_calls else 0.0,
                "avg_quality_score": avg_quality,
            })
            
            total_latency += agent_latency
            failures += agent_failures
        
        # Determine chain success
        chain_success = failures == 0
        
        # Find bottleneck (agent with highest latency)
        # Improved bottleneck detection: check if latency is 2x or more than average
        bottleneck = None
        bottleneck_threshold_multiplier = 2.0
        
        if agent_stats:
            avg_agent_latency = sum(a["avg_latency_ms"] for a in agent_stats) / len(agent_stats)
            
            # Find agents that are significantly slower than average
            potential_bottlenecks = [
                a for a in agent_stats
                if a["avg_latency_ms"] > avg_agent_latency * bottleneck_threshold_multiplier
            ]
            
            if potential_bottlenecks:
                # Select the slowest one as the bottleneck
                bottleneck = max(potential_bottlenecks, key=lambda a: a["avg_latency_ms"])
            else:
                # Fallback to slowest agent if no clear bottleneck
                bottleneck = max(agent_stats, key=lambda a: a["avg_latency_ms"])
        
        # Calculate bottleneck severity
        bottleneck_severity = "none"
        if bottleneck:
            avg_agent_latency = sum(a["avg_latency_ms"] for a in agent_stats) / len(agent_stats) if agent_stats else 0
            if bottleneck["avg_latency_ms"] > avg_agent_latency * 3.0:
                bottleneck_severity = "critical"
            elif bottleneck["avg_latency_ms"] > avg_agent_latency * 2.0:
                bottleneck_severity = "high"
            elif bottleneck["avg_latency_ms"] > avg_agent_latency * 1.5:
                bottleneck_severity = "medium"
            else:
                bottleneck_severity = "low"
        
        return {
            "chain_id": chain_id,
            "total_steps": len(calls),
            "unique_agents": len(agents),
            "total_latency": total_latency,
            "avg_latency_per_step": total_latency / len(calls) if calls else 0.0,
            "success": chain_success,
            "success_rate": (1 - failures / len(calls)) * 100 if calls else 0.0,
            "failure_count": failures,
            "bottleneck_agent": bottleneck["agent_name"] if bottleneck else None,
            "bottleneck_latency_ms": bottleneck["avg_latency_ms"] if bottleneck else 0.0,
            "bottleneck_severity": bottleneck_severity,
            "agents": agent_stats,
            "first_call_at": calls[0].created_at.isoformat() if calls else None,
            "last_call_at": calls[-1].created_at.isoformat() if calls else None,
        }
    
    def get_agent_statistics(
        self,
        project_id: int,
        days: int = 7,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Get statistics for all agents in a project
        
        Returns:
            Dictionary with agent statistics
        """
        if not db:
            raise ValueError("Database session required")
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get all API calls with agent names
        api_calls = db.query(APICall).filter(
            and_(
                APICall.project_id == project_id,
                APICall.created_at >= start_date,
                APICall.created_at <= end_date,
                APICall.agent_name.isnot(None),
            )
        ).all()
        
        # Group by agent
        agents: Dict[str, List[APICall]] = defaultdict(list)
        for call in api_calls:
            if call.agent_name:
                agents[call.agent_name].append(call)
        
        # Calculate statistics
        agent_stats = []
        for agent_name, calls in agents.items():
            total_calls = len(calls)
            successful_calls = sum(1 for c in calls if c.status_code and 200 <= c.status_code < 300)
            failed_calls = total_calls - successful_calls
            
            total_latency = sum(c.latency_ms or 0 for c in calls)
            avg_latency = total_latency / total_calls if total_calls > 0 else 0.0
            
            # Get quality scores
            quality_scores = []
            for call in calls:
                scores = db.query(QualityScore).filter(
                    QualityScore.api_call_id == call.id
                ).all()
                quality_scores.extend([s.overall_score for s in scores])
            
            avg_quality = (
                sum(quality_scores) / len(quality_scores)
                if quality_scores else 0.0
            )
            
            agent_stats.append({
                "agent_name": agent_name,
                "total_calls": total_calls,
                "successful_calls": successful_calls,
                "failed_calls": failed_calls,
                "success_rate": (successful_calls / total_calls * 100) if total_calls > 0 else 0.0,
                "avg_latency_ms": avg_latency,
                "total_latency_ms": total_latency,
                "avg_quality_score": avg_quality,
            })
        
        # Sort by failure rate (highest first)
        agent_stats.sort(key=lambda a: a["failed_calls"], reverse=True)
        
        return {
            "total_agents": len(agent_stats),
            "agents": agent_stats,
        }



