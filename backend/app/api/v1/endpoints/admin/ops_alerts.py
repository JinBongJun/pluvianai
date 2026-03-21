from typing import Literal, Optional, Self

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, model_validator

from app.core.logging_config import logger
from app.core.permissions import require_admin
from app.core.security import get_current_user
from app.models.user import User
from app.services.ops_alerting import ops_alerting

router = APIRouter()


class OpsAlertDryRunRequest(BaseModel):
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


@router.post("/ops-alerts/test", status_code=status.HTTP_202_ACCEPTED)
async def trigger_ops_alert_dry_run(
    body: OpsAlertDryRunRequest,
    current_user: User = Depends(get_current_user),
):
    """Admin-only dry-run endpoint for operational alerting."""
    require_admin(current_user)

    et = body.event_type
    if et == "live_view_api_degraded":
        for _ in range(body.repeats):
            ops_alerting.observe_live_view_agents_request(
                project_id=body.project_id,
                status_code=body.status_code,
                duration_ms=body.duration_ms,
            )
    elif et == "project_api_degraded":
        for _ in range(body.repeats):
            ops_alerting.observe_project_api_request(
                project_id=body.project_id,
                endpoint_group=body.endpoint_group,
                status_code=body.status_code,
                duration_ms=body.duration_ms,
            )
    elif et == "release_gate_failure_burst":
        for _ in range(body.repeats):
            ops_alerting.observe_release_gate_result(
                project_id=body.project_id,
                success=False,
                error_summary=body.error_summary or "dry-run release gate failure",
            )
    elif et == "release_gate_fail_ratio_high":
        for _ in range(body.repeats):
            ops_alerting.observe_release_gate_result(
                project_id=body.project_id,
                success=bool(body.success),
                error_summary=body.error_summary or "dry-run release gate ratio sample",
            )
    elif et == "provider_error_burst":
        for _ in range(body.repeats):
            ops_alerting.observe_provider_error(
                project_id=body.project_id,
                provider=body.provider,
                error_code=body.error_code,
                error_summary=body.error_summary or "dry-run provider error",
            )
    elif et == "db_error_burst":
        for _ in range(body.repeats):
            ops_alerting.observe_db_error(body.error_class or "OperationalError")
    elif et == "snapshot_error_ratio_high":
        for _ in range(body.repeats):
            ops_alerting.observe_snapshot_status(
                project_id=body.project_id,
                status_code=body.status_code,
            )
    elif et == "release_gate_tool_missing_surge":
        for _ in range(body.repeats):
            ops_alerting.observe_release_gate_tool_missing_surge(
                body.project_id,
                evidence_rows=body.evidence_rows,
                missing_rows=body.missing_rows,
            )
    else:
        ops_alerting.emit_test_alert(
            event_type="custom_dry_run",
            severity=body.custom_severity,
            title=body.custom_title or "Custom ops alert dry-run",
            summary=body.custom_summary or "Manual dry-run alert triggered by admin endpoint.",
            payload={
                "project_id": body.project_id,
                "repeats": body.repeats,
            },
        )

    logger.info(
        "Ops alert dry-run triggered",
        extra={
            "event_type": body.event_type,
            "project_id": body.project_id,
            "repeats": body.repeats,
            "admin_user_id": current_user.id,
        },
    )

    return {
        "accepted": True,
        "event_type": body.event_type,
        "project_id": body.project_id,
        "repeats": body.repeats,
        "note": "Dry-run signal emitted. Check ops webhook channel and backend logs.",
    }
