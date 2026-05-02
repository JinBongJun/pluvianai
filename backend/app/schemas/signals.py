from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SignalConfigCreate(BaseModel):
    signal_type: str = Field(..., description="Signal type (length_change, latency_limit, etc.)")
    name: str = Field(..., description="Configuration name")
    params: Optional[dict] = None
    severity: Optional[str] = Field(None, description="low/medium/high/critical")
    enabled: bool = True


class SignalConfigUpdate(BaseModel):
    name: Optional[str] = None
    params: Optional[dict] = None
    severity: Optional[str] = Field(None, description="low/medium/high/critical")
    enabled: Optional[bool] = None


class SignalConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: int
    signal_type: str
    name: str
    params: Optional[dict]
    severity: Optional[str]
    enabled: bool
    created_at: Optional[str] = None


class SignalDetectionRequest(BaseModel):
    response_text: str = Field(..., description="Response text to analyze")
    request_data: Optional[dict] = None
    response_data: Optional[dict] = None
    baseline_data: Optional[dict] = None


class SignalDetectionResponse(BaseModel):
    status: str
    signals: List[dict]
    signal_count: int
    critical_count: int
    high_count: int


class AgentSignalConfigPayload(BaseModel):
    signal_type: str
    params: Optional[dict] = None
    severity: Optional[str] = Field(None, description="low/medium/high/critical")
    enabled: Optional[bool] = True
