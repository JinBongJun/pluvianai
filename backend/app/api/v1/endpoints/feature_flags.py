"""
Feature flags endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict
from app.core.security import get_current_user
from app.models.user import User
from app.core.feature_flags import feature_flags
from app.core.decorators import handle_errors

router = APIRouter()


@router.get("", response_model=Dict[str, bool])
@handle_errors
async def get_feature_flags(
    current_user: User = Depends(get_current_user)
):
    """
    Get all feature flags for the current user
    """
    # Return all flags (can be filtered by user in the future)
    return feature_flags.get_all_flags()


@router.get("/{flag_name}", response_model=Dict[str, bool])
@handle_errors
async def get_feature_flag(
    flag_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Check if a specific feature flag is enabled for the current user
    """
    is_enabled = feature_flags.is_enabled(flag_name, user_id=current_user.id)
    return {
        "flag": flag_name,
        "enabled": is_enabled
    }
