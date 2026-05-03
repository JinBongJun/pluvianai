"""Admin API request DTOs."""

from typing import Literal, Optional, Self

from pydantic import BaseModel, Field, model_validator


class AdminOpsAlertDryRunRequest(BaseModel):
    event_type: Literal[
        "live_view_api_degraded",
        "project_api_degraded",
        "release_gate_failure_burst",
        "release_gate_fail_ratio_high",
        "provider_error_burst",
        "db_error_burst",
        "snapshot_error_ratio_high",
        "custom",
    ]
    project_id: int = Field(1, ge=1)
    repeats: int = Field(1, ge=1, le=250)
    status_code: int = Field(500, ge=100, le=599)
    duration_ms: float = Field(5000.0, ge=0)
    error_summary: str = ""
    error_class: str = "OperationalError"
    endpoint_group: Literal["live_view", "release_gate"] = "live_view"
    provider: Literal["openai", "anthropic", "google", "unknown"] = "openai"
    error_code: str = "provider_error"
    success: bool = Field(False)
    custom_severity: Literal["info", "warning", "critical"] = "warning"
    custom_title: Optional[str] = None
    custom_summary: Optional[str] = None


class ImpersonationRequest(BaseModel):
    """Impersonation request schema."""

    reason: Optional[str] = None
    duration_minutes: int = 60


class OpsAlertsDryRunRequest(BaseModel):
    event_type: Literal[
        "live_view_api_degraded",
        "project_api_degraded",
        "release_gate_failure_burst",
        "release_gate_fail_ratio_high",
        "provider_error_burst",
        "db_error_burst",
        "snapshot_error_ratio_high",
        "release_gate_tool_missing_surge",
        "custom",
    ]
    project_id: int = Field(1, ge=1)
    repeats: int = Field(1, ge=1, le=250)
    status_code: int = Field(500, ge=100, le=599)
    duration_ms: float = Field(5000.0, ge=0)
    error_summary: str = ""
    error_class: str = "OperationalError"
    endpoint_group: Literal["live_view", "release_gate"] = "live_view"
    provider: Literal["openai", "anthropic", "google", "unknown"] = "openai"
    error_code: str = "provider_error"
    success: bool = Field(False)
    custom_severity: Literal["info", "warning", "critical"] = "warning"
    custom_title: Optional[str] = None
    custom_summary: Optional[str] = None
    evidence_rows: int = Field(4, ge=1, le=500)
    missing_rows: int = Field(4, ge=0, le=500)

    @model_validator(mode="after")
    def _validate_tool_missing_rows(self) -> Self:
        if self.event_type == "release_gate_tool_missing_surge" and self.missing_rows > self.evidence_rows:
            raise ValueError("missing_rows must be <= evidence_rows")
        return self
