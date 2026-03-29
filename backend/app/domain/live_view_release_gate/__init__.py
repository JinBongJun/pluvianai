"""Shared domain logic for Live View + Release Gate."""

from .agent_visibility import (
    AgentVisibilityContext,
    AgentVisibilitySetting,
    build_agent_visibility_context,
    invalidate_agent_visibility_cache,
    is_agent_hard_deleted,
    is_agent_deleted,
    is_agent_hidden,
    is_agent_soft_deleted,
    restore_agent_if_soft_deleted,
)

__all__ = [
    "AgentVisibilityContext",
    "AgentVisibilitySetting",
    "build_agent_visibility_context",
    "invalidate_agent_visibility_cache",
    "is_agent_hard_deleted",
    "is_agent_deleted",
    "is_agent_hidden",
    "is_agent_soft_deleted",
    "restore_agent_if_soft_deleted",
]

