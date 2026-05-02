from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class APICallIngestBody(BaseModel):
    """SDK ingest: same shape as SDK sends. project_id can be omitted when provided in path.

    Limits: ``tool_events`` normalized to max 50 events per call; per-event JSON size capped server-side
    (see ``app.utils.tool_events``). See ``docs/live-view-ingest-field-matrix.md``.
    """

    project_id: Optional[int] = Field(None, description="Project ID (must match path if provided)")
    request_data: Dict[str, Any] = Field(default_factory=dict, description="LLM request payload")
    response_data: Dict[str, Any] = Field(default_factory=dict, description="LLM response payload")
    latency_ms: float = Field(0.0, description="Latency in ms")
    status_code: int = Field(200, description="HTTP status code")
    agent_name: Optional[str] = None
    chain_id: Optional[str] = None
    tool_events: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Optional tool_call/tool_result/action timeline from the client (see docs/release-gate-tool-io-grounding-plan.md)",
    )


class APICallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    provider: Optional[str] = None
    model: Optional[str] = None
    agent_name: Optional[str] = None
    total_tokens: Optional[int] = None
    cost: Optional[float] = None
    latency_ms: Optional[int] = None
    status_code: Optional[int] = None
    created_at: datetime
