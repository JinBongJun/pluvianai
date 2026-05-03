"""Release Gate API request and response DTOs."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ToolContextInject(BaseModel):
    """
    When mode=inject, resolved text is appended to the replay system prompt so runs can
    include docs/code/tool outcomes that were never captured in logs (e.g. redacted at source).
    """

    scope: Literal["per_snapshot", "global"] = Field(
        "per_snapshot",
        description=(
            "global: use global_text for every snapshot. "
            "per_snapshot: use by_snapshot_id[snapshot_id], then optional global_text if missing."
        ),
    )
    global_text: Optional[str] = Field(
        None,
        description="Shared additional system text when scope=global, or fallback when scope=per_snapshot.",
    )
    by_snapshot_id: Optional[Dict[str, str]] = Field(
        None,
        description="Map snapshot id (string) -> additional system text for that log.",
    )


class ToolContextConfig(BaseModel):
    mode: Literal["recorded", "inject"] = Field(
        "recorded",
        description="recorded: use captured request only. inject: append resolved ToolContextInject text to system prompt.",
    )
    inject: Optional[ToolContextInject] = Field(None, description="Used when mode=inject.")


class ReleaseGateToolExpectationField(BaseModel):
    name: str = Field(..., description="Expected field name.")
    description: Optional[str] = Field(None, description="Human-readable meaning of the field.")


class ReleaseGateToolExpectation(BaseModel):
    name: str = Field(..., description="Tool name.")
    tool_type: Literal["retrieval", "action"] = Field(
        ..., description="retrieval: returns information to the model. action: produces or sends payload/content."
    )
    description: Optional[str] = Field(None, description="Tool purpose shown in configuration UI.")
    result_guide: Optional[str] = Field(None, description="Optional extra guidance for the tool.")
    baseline_sample_summary: Optional[str] = Field(
        None, description="Optional baseline sample output summary imported from recorded tool history."
    )
    expected_result_fields: Optional[List[ReleaseGateToolExpectationField]] = Field(
        None, description="Structured fields expected back from retrieval tools."
    )
    expected_action_fields: Optional[List[ReleaseGateToolExpectationField]] = Field(
        None, description="Structured fields expected in action payload/content."
    )


class ReleaseGateValidateRequest(BaseModel):
    agent_id: Optional[str] = Field(
        None, description="Agent (node) to validate. Use with use_recent_snapshots or dataset_id."
    )
    use_recent_snapshots: bool = Field(
        False, description="If True, use recent snapshots for agent_id instead of trace_id/dataset_id."
    )
    recent_snapshot_limit: int = Field(
        20,
        ge=1,
        le=400,
        description="Max recent snapshots when use_recent_snapshots=True.",
    )
    trace_id: Optional[str] = Field(None, description="Target trace ID. Optional if dataset_id or use_recent_snapshots.")
    dataset_id: Optional[str] = Field(None, description="Deprecated. Use dataset_ids.")
    dataset_ids: Optional[List[str]] = Field(
        None, description="List of validation dataset IDs. Resolves snapshots from all datasets."
    )
    snapshot_ids: Optional[List[str]] = Field(
        None,
        description="Explicit snapshot IDs to use (e.g. from Live View log picker). When set, these are used instead of dataset_ids / use_recent_snapshots.",
    )
    baseline_trace_id: Optional[str] = Field(
        None, description="Optional baseline trace ID. Defaults to trace_id or first snapshot's trace."
    )
    model_source: Literal["detected", "platform"] = Field(
        "detected",
        description="Model source mode. detected=use node model; platform=use platform-provided model override.",
    )
    new_model: Optional[str] = Field(None, description="Replay model override")
    replay_provider: Optional[Literal["openai", "anthropic", "google"]] = Field(
        None, description="Optional provider override for replay calls."
    )
    replay_api_key: Optional[str] = Field(
        None,
        description=(
            "Optional provider API key override for replay calls. "
            "When omitted, server-side provider key is used."
        ),
    )
    replay_user_api_key_id: Optional[int] = Field(
        None,
        description=(
            "Optional saved project User API key id (Settings > API Keys). "
            "When set in detected/BYOK mode, this key is used for replay instead of the default lookup."
        ),
    )
    new_system_prompt: Optional[str] = Field(None, description="Replay system prompt override")
    replay_temperature: Optional[float] = Field(None, description="Replay request temperature override")
    replay_max_tokens: Optional[int] = Field(None, description="Replay request max_tokens override")
    replay_top_p: Optional[float] = Field(None, description="Replay request top_p override")
    replay_overrides: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Optional configuration-only overrides merged into the replay request body "
            "(e.g. tools, sampling/format knobs). Snapshot content fields such as "
            "messages/user_message/response/trace_id/agent_id/agent_name are ignored."
        ),
    )
    replay_overrides_by_snapshot_id: Optional[Dict[str, Dict[str, Any]]] = Field(
        None,
        description=(
            "Optional per-log request body overrides merged after replay_overrides for that snapshot id "
            "(string keys). Same disallowed keys as replay_overrides. Wins over replay_overrides "
            "on key conflict."
        ),
    )
    tool_context: Optional[ToolContextConfig] = Field(
        None,
        description=(
            "Optional additional system context for replay (e.g. tool/doc/code not present in captured logs). "
            "When mode=inject, resolved text is appended to the system prompt per snapshot."
        ),
    )
    tool_expectations: Optional[List[ReleaseGateToolExpectation]] = Field(
        None,
        description=(
            "Optional structured expectations for allowed tools. Stored with the run for UI preview and later "
            "runtime interpretation; not injected into the provider request."
        ),
    )
    rule_ids: Optional[List[str]] = Field(None, description="Optional specific rule IDs")
    max_snapshots: int = Field(20, ge=1, le=100, description="Max snapshots replayed from trace")
    repeat_runs: int = Field(3, ge=1, le=100, description="Repeat replay N times (1=quick, 10/50/100=stability)")
    fail_rate_max: float = Field(
        0.05,
        ge=0.0,
        le=1.0,
        description="Gate passes if FAIL case ratio <= this value.",
    )
    flaky_rate_max: float = Field(
        0.03,
        ge=0.0,
        le=1.0,
        description="Gate passes if FLAKY case ratio <= this value.",
    )
    evaluation_mode: Literal["replay_test"] = Field(
        "replay_test",
        description="Replay Test only.",
    )


ReleaseGateJobStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]


class ReleaseGateJobProgressOut(BaseModel):
    done: int = 0
    total: Optional[int] = None
    phase: Optional[str] = None


class ReleaseGateJobOut(BaseModel):
    id: str
    status: ReleaseGateJobStatus
    owner_agent_id: Optional[str] = None
    repeat_runs: Optional[int] = None
    snapshot_count: Optional[int] = None
    attempts_total: Optional[int] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    cancel_requested_at: Optional[str] = None
    progress: ReleaseGateJobProgressOut
    report_id: Optional[str] = None
    error_detail: Optional[Dict[str, Any]] = None
    perf: Optional[Dict[str, Optional[int]]] = None


class ReleaseGateJobCreateResponse(BaseModel):
    job: ReleaseGateJobOut


class ReleaseGateJobGetResponse(BaseModel):
    job: ReleaseGateJobOut
    result: Optional[Dict[str, Any]] = None


class ReleaseGateJobActiveResponse(BaseModel):
    job: Optional[ReleaseGateJobOut] = None
    result: Optional[Dict[str, Any]] = None
