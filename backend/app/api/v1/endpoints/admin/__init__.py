"""
Admin endpoints
"""

from fastapi import APIRouter
from .impersonation import router as impersonation_router
from .stats import router as stats_router
from .users import router as users_router

router = APIRouter()

# Include admin sub-routers
router.include_router(impersonation_router, tags=["admin"])
router.include_router(stats_router, tags=["admin"])
router.include_router(users_router, tags=["admin"])
