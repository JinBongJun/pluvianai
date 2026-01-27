"""
API v2 router.

v2 maintains backward compatibility with v1. New or breaking changes
are introduced here first; v1 remains stable per API_VERSIONING.md.
"""

from fastapi import APIRouter

api_router_v2 = APIRouter()

# Placeholder: v2-specific routes will be mounted here.
# Example: api_router_v2.include_router(some_v2_router, prefix="/projects", tags=["projects-v2"])
#
# Note: This router is included in main.py with prefix="/api/v2"
