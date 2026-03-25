from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.api_call import APICall
from app.models.quality_score import QualityScore


class AgentChainProfiler:
    """Summarize a chain of API calls for diagnostics and tests."""

    def profile_chain(
        self,
        project_id: int,
        chain_id: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        if db is None:
            raise ValueError("Database session required")

        query = db.query(APICall).filter(APICall.project_id == project_id)
        if chain_id:
            query = query.filter(APICall.chain_id == chain_id)

        calls = query.order_by(APICall.created_at.asc(), APICall.id.asc()).all()
        if not calls:
            return {
                "chain_id": chain_id,
                "total_calls": 0,
                "success_rate": 0.0,
                "avg_latency": 0.0,
                "agents": [],
            }

        call_ids = [int(call.id) for call in calls if getattr(call, "id", None) is not None]
        quality_rows = (
            db.query(QualityScore).filter(QualityScore.api_call_id.in_(call_ids)).all() if call_ids else []
        )
        quality_by_call_id = {
            int(row.api_call_id): float(row.overall_score or 0.0)
            for row in quality_rows
            if getattr(row, "api_call_id", None) is not None
        }

        success_count = sum(1 for call in calls if self._is_success(call.status_code))
        latencies = [float(call.latency_ms) for call in calls if call.latency_ms is not None]

        by_agent: Dict[str, Dict[str, Any]] = {}
        for call in calls:
            agent_name = str(call.agent_name or "unknown")
            row = by_agent.setdefault(
                agent_name,
                {
                    "agent_name": agent_name,
                    "total_calls": 0,
                    "success_count": 0,
                    "latencies": [],
                    "quality_scores": [],
                },
            )
            row["total_calls"] += 1
            if self._is_success(call.status_code):
                row["success_count"] += 1
            if call.latency_ms is not None:
                row["latencies"].append(float(call.latency_ms))
            quality = quality_by_call_id.get(int(call.id)) if getattr(call, "id", None) is not None else None
            if quality is not None:
                row["quality_scores"].append(quality)

        agents: List[Dict[str, Any]] = []
        for agent_name in sorted(by_agent.keys()):
            row = by_agent[agent_name]
            total = int(row["total_calls"])
            success = int(row["success_count"])
            latencies_agent = row["latencies"]
            quality_scores_agent = row["quality_scores"]
            agents.append(
                {
                    "agent_name": agent_name,
                    "total_calls": total,
                    "success_rate": (success / total) if total else 0.0,
                    "avg_latency": (sum(latencies_agent) / len(latencies_agent)) if latencies_agent else 0.0,
                    "avg_quality_score": (
                        sum(quality_scores_agent) / len(quality_scores_agent)
                    )
                    if quality_scores_agent
                    else None,
                }
            )

        return {
            "chain_id": chain_id or str(calls[0].chain_id or ""),
            "total_calls": len(calls),
            "success_rate": success_count / len(calls),
            "avg_latency": (sum(latencies) / len(latencies)) if latencies else 0.0,
            "agents": agents,
        }

    @staticmethod
    def _is_success(status_code: Optional[int]) -> bool:
        return status_code is not None and 200 <= int(status_code) < 300
