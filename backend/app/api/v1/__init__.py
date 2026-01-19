"""
API v1 router
"""
from fastapi import APIRouter
from app.api.v1.endpoints import auth, projects, project_members, api_calls, quality, drift, alerts, proxy, cost, benchmark, agent_chain, archive, admin, subscription, settings, export, activity, notifications, reports, webhooks, health, feature_flags

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(project_members.router, prefix="", tags=["project-members"])
api_router.include_router(api_calls.router, prefix="/api-calls", tags=["api-calls"])
api_router.include_router(quality.router, prefix="/quality", tags=["quality"])
api_router.include_router(drift.router, prefix="/drift", tags=["drift"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(proxy.router, prefix="/proxy", tags=["proxy"])
api_router.include_router(cost.router, prefix="/cost", tags=["cost"])
api_router.include_router(benchmark.router, prefix="/benchmark", tags=["benchmark"])
api_router.include_router(agent_chain.router, prefix="/agent-chain", tags=["agent-chain"])
api_router.include_router(archive.router, prefix="/archive", tags=["archive"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(subscription.router, prefix="/subscription", tags=["subscription"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(export.router, prefix="/export", tags=["export"])
api_router.include_router(activity.router, prefix="/activity", tags=["activity"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(feature_flags.router, prefix="/feature-flags", tags=["feature-flags"])

