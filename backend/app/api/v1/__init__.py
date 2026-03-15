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
    admin,
    # subscription,
    # export,
    health,
    organizations,
    # replay,
    # onboarding,
    # billing,
    # trust_center,
    # referral,
    user_api_keys,
    # shared_results,
    firewall,
    dashboard,
    settings,
    activity,
    signals,
    cost,
    live_view,
    test_runs,
    self_hosted,
    behavior,
    release_gate,
    internal_usage,
    feedback,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(self_hosted.router, prefix="/infrastructure", tags=["infrastructure"])
# api_router.include_router(replay.router, prefix="/replay", tags=["replay"])
api_router.include_router(project_members.router, prefix="", tags=["project-members"])
api_router.include_router(api_calls.router, prefix="/projects", tags=["api-calls"])
api_router.include_router(quality.router, prefix="/projects", tags=["quality"])
api_router.include_router(alerts.router, prefix="/projects", tags=["alerts"])
api_router.include_router(proxy.router, prefix="/proxy", tags=["proxy"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
# api_router.include_router(subscription.router, prefix="/subscription", tags=["subscription"])
# api_router.include_router(export.router, prefix="/export", tags=["export"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
# api_router.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
# api_router.include_router(billing.router, prefix="/billing", tags=["billing"])
# api_router.include_router(trust_center.router, prefix="/trust-center", tags=["trust-center"])
# api_router.include_router(referral.router, prefix="/referral", tags=["referral"])
api_router.include_router(user_api_keys.router, prefix="/projects/{project_id}/user-api-keys", tags=["user-api-keys"])
# api_router.include_router(shared_results.router, prefix="", tags=["shared-results"])
api_router.include_router(firewall.router, prefix="/projects", tags=["firewall"])
# api_router.include_router(ci.router, prefix="", tags=["ci"])
# api_router.include_router(self_hosted.router, prefix="", tags=["self-hosted"])
api_router.include_router(dashboard.router, prefix="", tags=["dashboard"])
# api_router.include_router(notifications.router, prefix="", tags=["notifications"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(activity.router, prefix="/activity", tags=["activity"])
# api_router.include_router(drift.router, prefix="/drift", tags=["drift"])
# api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(signals.router, prefix="", tags=["signals"])
# api_router.include_router(worst_prompts.router, prefix="", tags=["worst-prompts"])
# api_router.include_router(reviews.router, prefix="", tags=["reviews"])
# api_router.include_router(regression.router, prefix="", tags=["regression"])
api_router.include_router(cost.router, prefix="/cost", tags=["cost"])
api_router.include_router(live_view.router, prefix="", tags=["live-view"])
api_router.include_router(test_runs.router, prefix="/test-runs", tags=["test-runs"])
api_router.include_router(behavior.router, prefix="", tags=["behavior"])
api_router.include_router(release_gate.router, prefix="", tags=["release-gate"])
api_router.include_router(internal_usage.router, prefix="/internal", tags=["internal-usage"])
api_router.include_router(feedback.router, prefix="", tags=["feedback"])