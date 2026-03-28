"""
Subscription plan limits and feature configuration.

Publicly supported plans are `free`, `starter`, `pro`, and `enterprise`.
Legacy `indie` / `startup` plan ids are normalized into `starter` for backward compatibility.
"""

from typing import Any, Dict


def normalize_plan_type(plan_type: str | None) -> str:
    normalized = str(plan_type or "free").strip().lower()
    if normalized in {"indie", "startup"}:
        return "starter"
    if normalized in {"free", "starter", "pro", "enterprise"}:
        return normalized
    return "free"


FREE_LIMITS: Dict[str, Any] = {
    "organizations": 1,
    # Beta Free plan (publicly exposed)
    "projects": 2,
    "api_calls_per_month": 10_000,
    "snapshots_per_month": 10_000,
    # Guard credits are kept higher as an internal accounting unit even if
    # UI-level "runs per month" is lower.
    "guard_credits_per_month": 10_000,
    # Platform replay credits roughly map to hosted Release Gate runs.
    "platform_replay_credits_per_month": 60,
    "judge_calls_per_month": 100,
    "team_members_per_project": 3,
    "data_retention_days": 30,
    "input_prompts_per_test": 50,
    "repeat_count_per_test": 5,
    "csv_import_row_limit": 200,
    "total_calls_per_single_test": 1_000,
    "concurrent_tests_per_project": 0,
    "features": {
        "drift_detection": "basic",
        "quality_checks": "basic",
        "cost_monitoring": "basic",
        "latency_analysis": False,
        "error_monitoring": False,
        "alerts": False,
        "multi_model_comparison": False,
        "cost_anomaly_detection": False,
        "auto_mapping": False,
        "production_guard": False,
        "byok": True,
        "hosted_replay_models": "limited",
    },
}

STARTER_LIMITS: Dict[str, Any] = {
    "organizations": 3,
    "projects": 8,
    "api_calls_per_month": 50_000,
    "snapshots_per_month": 50_000,
    "guard_credits_per_month": 50_000,
    "platform_replay_credits_per_month": 600,
    "judge_calls_per_month": 1_000,
    "team_members_per_project": 5,
    "data_retention_days": 30,
    "input_prompts_per_test": 120,
    "repeat_count_per_test": 12,
    "csv_import_row_limit": 1_000,
    "total_calls_per_single_test": 10_000,
    "concurrent_tests_per_project": 0,
    "features": {
        "drift_detection": "enhanced",
        "quality_checks": "advanced",
        "cost_monitoring": True,
        "latency_analysis": True,
        "error_monitoring": True,
        "alerts": "full",
        "multi_model_comparison": True,
        "cost_anomaly_detection": True,
        "auto_mapping": True,
        "production_guard": True,
        "byok": True,
        "hosted_replay_models": "expanded",
    },
}


PRO_LIMITS: Dict[str, Any] = {
    "organizations": 10,
    "projects": 30,
    "api_calls_per_month": 200_000,
    "snapshots_per_month": 200_000,
    "guard_credits_per_month": 200_000,
    "platform_replay_credits_per_month": 3_000,
    "judge_calls_per_month": 10_000,
    "team_members_per_project": 5,
    "data_retention_days": 90,
    "input_prompts_per_test": 250,
    "repeat_count_per_test": 25,
    "csv_import_row_limit": 2_000,
    "total_calls_per_single_test": 25_000,
    "concurrent_tests_per_project": 0,
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
        "region_latency": False,
        "advanced_cost_optimizer": False,
        "model_auto_switch": False,
        "rbac": False,
        "byok": True,
        "hosted_replay_models": "expanded",
    },
}

ENTERPRISE_LIMITS: Dict[str, Any] = {
    "organizations": -1,
    "projects": -1,
    "api_calls_per_month": -1,
    "snapshots_per_month": -1,
    "guard_credits_per_month": -1,
    "platform_replay_credits_per_month": -1,
    "judge_calls_per_month": -1,
    "team_members_per_project": -1,
    "data_retention_days": 365,
    "input_prompts_per_test": 5_000,
    "repeat_count_per_test": 1_000,
    "csv_import_row_limit": 10_000,
    "total_calls_per_single_test": 1_000_000,
    "concurrent_tests_per_project": 0,
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
        "drift_per_agent_stage": True,
        "region_latency": True,
        "advanced_cost_optimizer": True,
        "model_auto_switch": True,
        "rbac": "persona_based",
        "self_hosted": True,
        "dedicated_support": True,
        "sla": True,
        "data_masking": True,
        "custom_evaluator_rules": True,
        "custom_integrations": True,
        "byok": True,
        "hosted_replay_models": "custom",
    },
}


PLAN_LIMITS: Dict[str, Dict[str, Any]] = {
    "free": FREE_LIMITS,
    "starter": STARTER_LIMITS,
    "pro": PRO_LIMITS,
    "enterprise": ENTERPRISE_LIMITS,
    # Legacy aliases kept so existing subscriptions continue to resolve safely.
    "indie": STARTER_LIMITS,
    "startup": STARTER_LIMITS,
}


PLAN_PRICING: Dict[str, int] = {
    "free": 0,
    "starter": 49,
    "pro": 129,
    "enterprise": 0,
    "indie": 49,
    "startup": 49,
}
