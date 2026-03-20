from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.api_call import APICall
from app.models.quality_score import QualityScore


class BenchmarkService:
    """Aggregate model-level benchmark summaries for a project."""

    def compare_models(self, project_id: int, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        if db is None:
            raise ValueError("Database session required")

        calls = (
            db.query(APICall)
            .filter(APICall.project_id == project_id)
            .order_by(APICall.provider.asc(), APICall.model.asc(), APICall.id.asc())
            .all()
        )
        if not calls:
            return []

        call_ids = [int(call.id) for call in calls if getattr(call, "id", None) is not None]
        quality_rows = (
            db.query(QualityScore).filter(QualityScore.api_call_id.in_(call_ids)).all() if call_ids else []
        )
        quality_by_call_id = {
            int(row.api_call_id): float(row.overall_score or 0.0)
            for row in quality_rows
            if getattr(row, "api_call_id", None) is not None
        }

        grouped: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for call in calls:
            provider = str(call.provider or "unknown")
            model = str(call.model or "unknown")
            key = (provider, model)
            row = grouped.setdefault(
                key,
                {
                    "provider": provider,
                    "model": model,
                    "total_calls": 0,
                    "success_count": 0,
                    "latencies": [],
                    "total_cost": 0.0,
                    "quality_scores": [],
                },
            )
            row["total_calls"] += 1
            if self._is_success(call.status_code):
                row["success_count"] += 1
            if call.latency_ms is not None:
                row["latencies"].append(float(call.latency_ms))
            row["total_cost"] += float(call.cost or 0.0)
            quality = quality_by_call_id.get(int(call.id)) if getattr(call, "id", None) is not None else None
            if quality is not None:
                row["quality_scores"].append(quality)

        results: List[Dict[str, Any]] = []
        for key in sorted(grouped.keys()):
            row = grouped[key]
            total_calls = int(row["total_calls"])
            latencies = row["latencies"]
            quality_scores = row["quality_scores"]
            total_cost = float(row["total_cost"])
            results.append(
                {
                    "provider": row["provider"],
                    "model": row["model"],
                    "total_calls": total_calls,
                    "avg_quality_score": (
                        sum(quality_scores) / len(quality_scores)
                    )
                    if quality_scores
                    else None,
                    "total_cost": total_cost,
                    "cost_per_call": (total_cost / total_calls) if total_calls else 0.0,
                    "avg_latency": (sum(latencies) / len(latencies)) if latencies else 0.0,
                    "success_rate": (int(row["success_count"]) / total_calls) if total_calls else 0.0,
                }
            )

        return results

    @staticmethod
    def _is_success(status_code: Optional[int]) -> bool:
        return status_code is not None and 200 <= int(status_code) < 300
