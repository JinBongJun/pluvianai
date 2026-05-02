"""Behavior API request DTOs."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class BehaviorRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    scope_type: str = Field(default="project", description="project | agent | canvas")
    scope_ref: Optional[str] = None
    severity_default: Optional[str] = Field(None, description="low | medium | high | critical")
    rule_json: Dict[str, Any] = Field(..., description="Rule spec JSON")
    enabled: bool = True


class BehaviorRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    scope_type: Optional[str] = None
    scope_ref: Optional[str] = None
    severity_default: Optional[str] = None
    rule_json: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class BehaviorValidateRequest(BaseModel):
    trace_id: Optional[str] = None
    test_run_id: Optional[str] = None
    rule_ids: Optional[List[str]] = None
    baseline_run_ref: Optional[str] = None


class BehaviorCompareRequest(BaseModel):
    baseline_test_run_id: str = Field(..., description="Baseline test run ID")
    candidate_test_run_id: str = Field(..., description="Candidate test run ID to compare")
    rule_ids: Optional[List[str]] = Field(None, description="Optional: specific rule IDs to compare")


class CIGateRequest(BaseModel):
    baseline_test_run_id: Optional[str] = Field(None, description="Baseline test run ID (optional)")
    candidate_test_run_id: str = Field(..., description="Candidate test run ID to validate")
    rule_ids: Optional[List[str]] = Field(None, description="Optional: specific rule IDs to validate")
    thresholds: Dict[str, Any] = Field(
        default_factory=lambda: {},
        description="Thresholds: e.g., {'critical': 0, 'high': 2, 'medium': 10, 'low': 50}",
    )


class ValidationDatasetCreate(BaseModel):
    """Create a validation dataset from current run/selection."""

    trace_ids: Optional[List[str]] = Field(None, description="Trace IDs to include")
    snapshot_ids: Optional[List[int]] = Field(None, description="Snapshot IDs to include (alternative to trace_ids)")
    agent_id: Optional[str] = None
    label: Optional[str] = Field(None, max_length=200)
    tag: Optional[str] = Field(None, max_length=100)
    eval_config_snapshot: Optional[Dict[str, Any]] = Field(None, description="Eval config at save time")
    policy_ruleset_snapshot: Optional[List[Dict[str, Any]]] = Field(
        None, description="Rule snapshot: [{id, revision, rule_json}, ...]"
    )
    ruleset_hash: Optional[str] = None


class ValidationDatasetUpdate(BaseModel):
    """Update a validation dataset (e.g. snapshot_ids for removing one log)."""

    snapshot_ids: Optional[List[int]] = Field(None, description="New list of snapshot IDs (replaces existing)")
    label: Optional[str] = Field(None, max_length=200, description="Dataset label")


class BatchDeleteDatasetsRequest(BaseModel):
    """Request body for deleting multiple validation datasets in one call."""

    dataset_ids: List[str] = Field(..., min_length=1, max_length=100, description="IDs of datasets to delete")


class BatchCreateDatasetsRequest(BaseModel):
    """Request body for creating multiple validation datasets in one call."""

    items: List[ValidationDatasetCreate] = Field(..., min_length=1, max_length=50, description="One dataset spec per item")
