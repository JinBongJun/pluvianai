"""Live View API request DTOs."""

from typing import List

from pydantic import BaseModel, Field


class SaveLogsRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Snapshot IDs to save for the selected node.",
    )


class DeleteSavedLogsRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Snapshot IDs to remove from saved logs for the selected node.",
    )


class SnapshotBatchDeleteRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Snapshot IDs to soft-delete.",
    )


class SnapshotBatchActionRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Snapshot IDs for batch action.",
    )


class AgentHardDeleteRequest(BaseModel):
    agent_ids: List[str] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Agent IDs (system_prompt_hash) to hard-delete for this project.",
    )
