"""
Cost Analyzer Service - Analyze API call costs
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta


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
    }
    
    def __init__(self):
        self.pricing = self.DEFAULT_PRICING.copy()
    
    def analyze_project_costs(
        self,
        api_calls: List[Any],
        period_days: int = 30
    ) -> Dict[str, Any]:
        """Analyze costs for a project's API calls"""
        total_cost = 0.0
        total_input_tokens = 0
        total_output_tokens = 0
        cost_by_model = {}
        
        for call in api_calls:
            model = getattr(call, 'model', 'unknown')
            input_tokens = getattr(call, 'input_tokens', 0) or 0
            output_tokens = getattr(call, 'output_tokens', 0) or 0
            
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            
            pricing = self.pricing.get(model, {"input": 0.001, "output": 0.003})
            input_cost = (input_tokens / 1000) * pricing["input"]
            output_cost = (output_tokens / 1000) * pricing["output"]
            call_cost = input_cost + output_cost
            
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
        
        return {
            "total_cost": round(total_cost, 4),
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "total_tokens": total_input_tokens + total_output_tokens,
            "call_count": len(api_calls),
            "cost_by_model": cost_by_model,
            "period_days": period_days,
            "avg_cost_per_call": round(total_cost / len(api_calls), 6) if api_calls else 0,
        }
    
    def estimate_monthly_cost(self, daily_calls: int, avg_tokens_per_call: int = 1000, model: str = "gpt-4o-mini") -> float:
        """Estimate monthly cost based on daily usage"""
        pricing = self.pricing.get(model, {"input": 0.001, "output": 0.003})
        # Assume 50% input, 50% output
        input_tokens = avg_tokens_per_call * 0.5
        output_tokens = avg_tokens_per_call * 0.5
        
        cost_per_call = (input_tokens / 1000) * pricing["input"] + (output_tokens / 1000) * pricing["output"]
        
        return round(cost_per_call * daily_calls * 30, 2)
