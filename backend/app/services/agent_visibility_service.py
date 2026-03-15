"""
Backward-compatible import shim.

Phase 3 moves shared Live View + Release Gate visibility logic
to `app.domain.live_view_release_gate.agent_visibility`.
"""

from app.domain.live_view_release_gate.agent_visibility import (
    AgentVisibilityContext,
    build_agent_visibility_context,
    is_agent_deleted,
)

__all__ = [
    "AgentVisibilityContext",
    "build_agent_visibility_context",
    "is_agent_deleted",
]

