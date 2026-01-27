"""
API v1 router
"""

from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    projects,
    project_members,
    api_calls,
    quality,
    alerts,
    proxy,
    benchmark,
    admin,
    subscription,
    export,
    health,
    organizations,
    replay,
    onboarding,
    billing,
    model_validation,
    trust_center,
    mapping,
    problem_analysis,
    dependency_analysis,
    performance_analysis,
    insights,
    referral,
    user_api_keys,
    shared_results,
    firewall,
    ci,
    judge_feedback,
    self_hosted,
    dashboard,
    notifications,
    rule_market,
    public_benchmarks,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(replay.router, prefix="/replay", tags=["replay"])
api_router.include_router(project_members.router, prefix="", tags=["project-members"])
api_router.include_router(api_calls.router, prefix="/api-calls", tags=["api-calls"])
api_router.include_router(quality.router, prefix="/quality", tags=["quality"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(proxy.router, prefix="/proxy", tags=["proxy"])
api_router.include_router(benchmark.router, prefix="/benchmark", tags=["benchmark"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(subscription.router, prefix="/subscription", tags=["subscription"])
api_router.include_router(export.router, prefix="/export", tags=["export"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(billing.router, prefix="/billing", tags=["billing"])
api_router.include_router(model_validation.router, prefix="", tags=["model-validation"])
api_router.include_router(trust_center.router, prefix="/trust-center", tags=["trust-center"])
api_router.include_router(mapping.router, prefix="/projects", tags=["mapping"])
api_router.include_router(problem_analysis.router, prefix="/projects", tags=["problem-analysis"])
api_router.include_router(dependency_analysis.router, prefix="/projects", tags=["dependency-analysis"])
api_router.include_router(performance_analysis.router, prefix="/projects", tags=["performance-analysis"])
api_router.include_router(insights.router, prefix="/projects", tags=["insights"])
api_router.include_router(referral.router, prefix="/referral", tags=["referral"])
api_router.include_router(user_api_keys.router, prefix="/projects", tags=["user-api-keys"])
api_router.include_router(shared_results.router, prefix="", tags=["shared-results"])
api_router.include_router(firewall.router, prefix="", tags=["firewall"])
api_router.include_router(ci.router, prefix="", tags=["ci"])
api_router.include_router(judge_feedback.router, prefix="", tags=["judge-feedback"])
api_router.include_router(self_hosted.router, prefix="", tags=["self-hosted"])
api_router.include_router(dashboard.router, prefix="", tags=["dashboard"])
api_router.include_router(notifications.router, prefix="", tags=["notifications"])
api_router.include_router(rule_market.router, prefix="", tags=["rule-market"])
api_router.include_router(public_benchmarks.router, prefix="", tags=["public-benchmarks"])