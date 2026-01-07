"""
Subscription plan limits and features configuration
"""
from typing import Dict, Any

PLAN_LIMITS: Dict[str, Dict[str, Any]] = {
    "free": {  # $0 - Onboarding + 문제 발견 압박용
        "projects": 1,
        "api_calls_per_month": 1000,
        "team_members_per_project": 1,
        "data_retention_days": 7,
        "features": {
            "drift_detection": "basic",  # 길이/포맷만 (Length/Format only)
            "quality_checks": "basic",  # JSON/Structure only
            "cost_monitoring": "basic",  # Basic cost monitor only
            "latency_analysis": False,
            "error_monitoring": False,
            "alerts": False,  # No alerts at all
            "multi_model_comparison": False,
            "agent_chain_profiler": False,
            "reports": False,
            "cost_anomaly_detection": False,
        }
    },
    "indie": {  # $19/month - Personal/Indie developers
        "projects": 3,
        "api_calls_per_month": 30000,
        "team_members_per_project": 1,
        "data_retention_days": 30,
        "features": {
            "drift_detection": "basic",  # Full Basic Drift
            "quality_checks": "basic",  # JSON/Structure
            "cost_monitoring": True,
            "latency_analysis": True,
            "error_monitoring": True,
            "alerts": "email",  # Email alerts only
            "multi_model_comparison": False,
            "agent_chain_profiler": False,
            "reports": "manual",  # Manual report generation
            "cost_anomaly_detection": True,
        }
    },
    "startup": {  # $59/month - Core target, Most Popular
        "projects": 10,
        "api_calls_per_month": 200000,
        "team_members_per_project": 3,  # Team accounts: 3 members
        "data_retention_days": 90,
        "features": {
            "drift_detection": "enhanced",  # Semantic/Tone drift
            "quality_checks": "advanced",  # LLM-based evaluator
            "cost_monitoring": True,
            "cost_anomaly_detection": True,
            "latency_analysis": True,
            "error_monitoring": True,
            "alerts": "full",  # Slack/Email/Discord
            "multi_model_comparison": True,  # GPT vs Claude vs Gemini vs Llama
            "weekly_reports": True,  # Weekly AI Health Report
            "api_token_cost_prediction": True,  # API 토큰 예측 비용 그래프
            "model_optimization_advisor": True,  # Model optimization recommendations
            "agent_chain_profiler": False,
            "region_latency": False,
            "advanced_cost_optimizer": False,
            "model_auto_switch": False,
        }
    },
    "pro": {  # $199/month - Growing startups/tech teams
        "projects": -1,  # unlimited (soft limit)
        "api_calls_per_month": -1,  # unlimited (soft limit)
        "team_members_per_project": 5,  # Team accounts: 5 members
        "data_retention_days": 180,
        "features": {
            "drift_detection": "enhanced",  # Semantic/Tone + Agent-level drift
            "quality_checks": "advanced",
            "cost_monitoring": True,
            "cost_anomaly_detection": True,
            "latency_analysis": True,
            "error_monitoring": True,
            "alerts": "full",
            "multi_model_comparison": True,
            "weekly_reports": True,
            "api_token_cost_prediction": True,
            "model_optimization_advisor": True,
            "agent_chain_profiler": True,  # Agent Chain Profiler (핵심 기능)
            "drift_per_agent_stage": True,  # Drift per Agent Stage
            "region_latency": True,  # Region latency analysis
            "advanced_cost_optimizer": True,  # Advanced Cost Optimizer
            "model_auto_switch": True,  # Model Auto-switch Advisor
            "rbac": True,  # Role-based access control
            "self_hosted": False,
            "dedicated_support": False,
            "sla": False,
            "data_masking": False,
            "custom_evaluator_rules": False,
        }
    },
    "enterprise": {  # $499/month - Finance/Healthcare/Security-sensitive
        "projects": -1,  # unlimited
        "api_calls_per_month": -1,  # unlimited
        "team_members_per_project": -1,  # Custom team size
        "data_retention_days": 365,  # 1 year+
        "features": {
            "drift_detection": "enhanced",
            "quality_checks": "advanced",
            "cost_monitoring": True,
            "cost_anomaly_detection": True,
            "latency_analysis": True,
            "error_monitoring": True,
            "alerts": "full",
            "multi_model_comparison": True,
            "weekly_reports": True,
            "api_token_cost_prediction": True,
            "model_optimization_advisor": True,
            "agent_chain_profiler": True,
            "drift_per_agent_stage": True,
            "region_latency": True,
            "advanced_cost_optimizer": True,
            "model_auto_switch": True,
            "rbac": "persona_based",  # Persona별 권한 관리
            "self_hosted": True,  # Self-hosted / On-premise
            "dedicated_support": True,  # 전담 지원
            "sla": True,  # SLA 99.9%
            "data_masking": True,  # 데이터 마스킹 옵션
            "custom_evaluator_rules": True,  # 자체 evaluator 룰 구축
            "custom_integrations": True,
        }
    }
}

PLAN_PRICING: Dict[str, int] = {
    "free": 0,
    "indie": 19,
    "startup": 59,
    "pro": 199,
    "enterprise": 499,
}


