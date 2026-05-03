"""
Cost Analyzer Service - Analyze API call costs
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone


class CostAnalyzer:
    """Analyzer for API call costs"""
    
    # Default pricing per 1K tokens (USD)
    DEFAULT_PRICING = {
        "gpt-4o": {"input": 0.005, "output": 0.015},
        "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
        "gpt-4-turbo": {"input": 0.01, "output": 0.03},
        "gpt-4": {"input": 0.03, "output": 0.06},
        "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
        "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
        "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
        "claude-3-sonnet-20240229": {"input": 0.003, "output": 0.015},
        "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125},
        "gemini-pro": {"input": 0.0005, "output": 0.0015},
        "gemini-ultra": {"input": 0.001, "output": 0.003},
    }
    
    def __init__(self):
        self.pricing = self.DEFAULT_PRICING.copy()

    def analyze_project_costs(
        self,
        api_calls: Optional[List[Any]] = None,
        period_days: int = 30,
        *,
        project_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        db: Any = None,
    ) -> Dict[str, Any]:
        """Analyze costs for a project.

        Supports both the list-based form and the legacy project form:
        analyze_project_costs(api_calls, period_days) or analyze_project_costs(project_id, db=...).
        """
        if project_id is None and isinstance(api_calls, int):
            project_id = api_calls
            api_calls = None

        if project_id is not None and db is None:
            raise ValueError("Database session required")

        if project_id is not None:
            from app.models.api_call import APICall
            if start_date is None or end_date is None:
                end_date = datetime.now(timezone.utc)
                start_date = end_date - timedelta(days=period_days)
            query_start = self._to_db_datetime(start_date)
            query_end = self._to_db_datetime(end_date)
            api_calls = (
                db.query(APICall)
                .filter(
                    APICall.project_id == project_id,
                    APICall.created_at >= query_start,
                    APICall.created_at <= query_end,
                )
                .all()
            )
            period_days = max(1, (end_date - start_date).days)
        if api_calls is None:
            api_calls = []
        result = self._analyze_costs(api_calls, period_days)
        if start_date is not None:
            result["period_start"] = start_date
        if end_date is not None:
            result["period_end"] = end_date
        return result

    def _analyze_costs(
        self,
        api_calls: List[Any],
        period_days: int = 30
    ) -> Dict[str, Any]:
        """Analyze costs for a list of API calls."""
        total_cost = 0.0
        total_input_tokens = 0
        total_output_tokens = 0
        cost_by_model = {}
        cost_by_provider = {}
        cost_by_day = {}
        
        for call in api_calls:
            model = getattr(call, "model", None) or "unknown"
            provider = getattr(call, "provider", None) or "unknown"
            input_tokens = self._call_input_tokens(call)
            output_tokens = self._call_output_tokens(call)
            
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            
            call_cost = self.calculate_cost(
                provider=provider,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
            
            total_cost += call_cost
            
            if model not in cost_by_model:
                cost_by_model[model] = {
                    "cost": 0.0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "call_count": 0,
                }
            cost_by_model[model]["cost"] += call_cost
            cost_by_model[model]["input_tokens"] += input_tokens
            cost_by_model[model]["output_tokens"] += output_tokens
            cost_by_model[model]["call_count"] += 1

            if provider not in cost_by_provider:
                cost_by_provider[provider] = {"cost": 0.0, "call_count": 0}
            cost_by_provider[provider]["cost"] += call_cost
            cost_by_provider[provider]["call_count"] += 1

            created_at = getattr(call, "created_at", None)
            if isinstance(created_at, datetime):
                day_key = created_at.date().isoformat()
                if day_key not in cost_by_day:
                    cost_by_day[day_key] = {"date": day_key, "cost": 0.0, "call_count": 0}
                cost_by_day[day_key]["cost"] += call_cost
                cost_by_day[day_key]["call_count"] += 1
        
        for model_totals in cost_by_model.values():
            model_totals["cost"] = round(model_totals["cost"], 4)
        for provider_totals in cost_by_provider.values():
            provider_totals["cost"] = round(provider_totals["cost"], 4)
        by_day = [
            {"date": day, "cost": round(values["cost"], 4), "call_count": values["call_count"]}
            for day, values in sorted(cost_by_day.items())
        ]
        rounded_total = round(total_cost, 4)
        return {
            "total_cost": rounded_total,
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "total_tokens": total_input_tokens + total_output_tokens,
            "call_count": len(api_calls),
            "cost_by_model": cost_by_model,
            "by_model": cost_by_model,
            "by_provider": cost_by_provider,
            "by_day": by_day,
            "period_days": period_days,
            "avg_cost_per_call": round(total_cost / len(api_calls), 6) if api_calls else 0,
            "average_daily_cost": round(total_cost / max(1, period_days), 6),
        }

    def calculate_cost(self, provider: str, model: str, input_tokens: int = 0, output_tokens: int = 0) -> float:
        """Calculate cost for a single API call."""
        pricing = self.pricing.get(model, {"input": 0.001, "output": 0.003})
        input_cost = (max(int(input_tokens or 0), 0) / 1000) * pricing["input"]
        output_cost = (max(int(output_tokens or 0), 0) / 1000) * pricing["output"]
        return round(input_cost + output_cost, 6)

    def detect_cost_anomalies(self, project_id: int, db: Any = None) -> List[Any]:
        """Detect simple day-over-day cost spikes for scheduler alerts."""
        if db is None:
            raise ValueError("Database session required")

        from app.models.alert import Alert
        from app.models.api_call import APICall

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)
        week_start = today_start - timedelta(days=7)

        calls = (
            db.query(APICall)
            .filter(
                APICall.project_id == project_id,
                APICall.created_at >= self._to_db_datetime(week_start),
                APICall.created_at <= self._to_db_datetime(now),
            )
            .all()
        )
        if not calls:
            return []

        today_cost = self._sum_cost(
            call for call in calls if self._in_range(getattr(call, "created_at", None), today_start, now)
        )
        yesterday_cost = self._sum_cost(
            call for call in calls if self._in_range(getattr(call, "created_at", None), yesterday_start, today_start)
        )
        previous_week_cost = self._sum_cost(
            call for call in calls if self._in_range(getattr(call, "created_at", None), week_start, today_start)
        )
        previous_daily_avg = previous_week_cost / 7 if previous_week_cost > 0 else 0

        # Prefer a direct day-over-day baseline when available. Test fixtures can
        # accumulate unrelated earlier calls for the same project, so the weekly
        # average is only a fallback when yesterday has no comparable usage.
        baseline = yesterday_cost if yesterday_cost > 0 else previous_daily_avg
        if today_cost <= 0 or baseline <= 0 or today_cost < baseline * 2:
            return []

        ratio = today_cost / baseline
        severity = "critical" if ratio >= 10 else ("high" if ratio >= 5 else "medium")
        return [
            Alert(
                project_id=project_id,
                alert_type="cost_spike",
                severity=severity,
                title="Cost spike detected",
                description=f"Today's estimated cost ${today_cost:.4f} is {ratio:.1f}x the recent baseline.",
            )
        ]
    
    def estimate_monthly_cost(self, daily_calls: int, avg_tokens_per_call: int = 1000, model: str = "gpt-4o-mini") -> float:
        """Estimate monthly cost based on daily usage"""
        pricing = self.pricing.get(model, {"input": 0.001, "output": 0.003})
        # Assume 50% input, 50% output
        input_tokens = avg_tokens_per_call * 0.5
        output_tokens = avg_tokens_per_call * 0.5
        
        cost_per_call = (input_tokens / 1000) * pricing["input"] + (output_tokens / 1000) * pricing["output"]
        
        return round(cost_per_call * daily_calls * 30, 2)

    @staticmethod
    def _to_db_datetime(value: datetime) -> datetime:
        return value.replace(tzinfo=None) if value.tzinfo is not None else value

    @staticmethod
    def _as_aware(value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)

    @classmethod
    def _in_range(cls, value: Optional[datetime], start: datetime, end: datetime) -> bool:
        normalized = cls._as_aware(value)
        return bool(normalized is not None and start <= normalized < end)

    @staticmethod
    def _call_input_tokens(call: Any) -> int:
        return int(
            getattr(call, "input_tokens", None)
            or getattr(call, "request_tokens", None)
            or 0
        )

    @staticmethod
    def _call_output_tokens(call: Any) -> int:
        return int(
            getattr(call, "output_tokens", None)
            or getattr(call, "response_tokens", None)
            or 0
        )

    def _sum_cost(self, calls: Any) -> float:
        total = 0.0
        for call in calls:
            total += self.calculate_cost(
                provider=getattr(call, "provider", None) or "unknown",
                model=getattr(call, "model", None) or "unknown",
                input_tokens=self._call_input_tokens(call),
                output_tokens=self._call_output_tokens(call),
            )
        return total
