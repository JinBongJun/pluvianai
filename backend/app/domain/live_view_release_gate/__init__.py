"""Shared domain logic for Live View + Release Gate."""

from .agent_visibility import (
    AgentVisibilityContext,
    build_agent_visibility_context,
    is_agent_deleted,
    restore_agent_if_soft_deleted,
)

__all__ = [
    "AgentVisibilityContext",
    "build_agent_visibility_context",
    "is_agent_deleted",
    "restore_agent_if_soft_deleted",
]

