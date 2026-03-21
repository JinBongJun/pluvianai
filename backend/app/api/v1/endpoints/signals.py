"""
Signal Detection API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.models.user import User
from app.models.project import Project
from app.services.signal_detection_service import SignalDetectionService

router = APIRouter()


# Request/Response Models

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


# Endpoints

@router.get("/projects/{project_id}/signals/configs", response_model=List[SignalConfigResponse])
async def list_signal_configs(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all signal configurations for a project"""
    project = check_project_access(project_id, current_user, db)
    
    service = SignalDetectionService(db)
    configs = service.get_signal_configs_for_project(project_id)
    
    return configs


@router.get("/projects/{project_id}/signal-config/default", response_model=List[SignalConfigResponse])
async def get_default_signal_configs(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get effective default signal configs for a project.
    Returns DB configs when present, otherwise built-in defaults.
    """
    project = check_project_access(project_id, current_user, db)
    
    service = SignalDetectionService(db)
    defaults = service.get_project_default_configs(project_id)
    return defaults


@router.post("/projects/{project_id}/signals/configs", response_model=SignalConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_signal_config(
    project_id: int,
    config_data: SignalConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new signal configuration"""
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER])
    
    service = SignalDetectionService(db)
    config = service.create_signal_config(
        project_id=project_id,
        signal_type=config_data.signal_type,
        name=config_data.name,
        params=config_data.params,
        severity=config_data.severity,
        enabled=config_data.enabled,
    )
    
    return config


@router.put("/projects/{project_id}/signals/configs/{config_id}", response_model=SignalConfigResponse)
async def update_signal_config(
    project_id: int,
    config_id: str,
    config_data: SignalConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a signal configuration"""
    check_project_access(
        project_id,
        current_user,
        db,
        required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN],
    )
    service = SignalDetectionService(db)
    config = service.get_signal_config_by_id(config_id)
    if not config or config.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal configuration not found"
        )

    update_data = config_data.model_dump(exclude_unset=True)
    config = service.update_signal_config(config_id, project_id=project_id, **update_data)
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal configuration not found"
        )
    
    return config


@router.delete("/projects/{project_id}/signals/configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_signal_config(
    project_id: int,
    config_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a signal configuration"""
    check_project_access(
        project_id,
        current_user,
        db,
        required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN],
    )
    service = SignalDetectionService(db)
    config = service.get_signal_config_by_id(config_id)
    if not config or config.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal configuration not found"
        )
    
    success = service.delete_signal_config(config_id, project_id=project_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal configuration not found"
        )


@router.get(
    "/projects/{project_id}/live-view/agents/{agent_id}/signal-config",
    response_model=List[SignalConfigResponse],
)
async def get_agent_signal_config(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get effective signal configs for a specific Live View agent.
    Merges built-in defaults, project configs, and agent-specific overrides.
    """
    project = check_project_access(project_id, current_user, db)
    
    service = SignalDetectionService(db)
    configs = service.get_agent_configs(project_id, agent_id)
    return configs


@router.put(
    "/projects/{project_id}/live-view/agents/{agent_id}/signal-config",
    response_model=List[SignalConfigResponse],
)
async def upsert_agent_signal_config(
    project_id: int,
    agent_id: str,
    payload: List[AgentSignalConfigPayload],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upsert signal configs for a specific Live View agent.
    Each payload entry updates or creates a SignalConfig row scoped to that agent.
    """
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.ADMIN, ProjectRole.OWNER])
    
    service = SignalDetectionService(db)
    updated = []
    for item in payload:
        cfg = service.upsert_agent_signal_config(
            project_id=project_id,
            agent_id=agent_id,
            signal_type=item.signal_type,
            name=None,
            params=item.params,
            severity=item.severity,
            enabled=item.enabled,
        )
        updated.append(cfg)
    return updated


@router.post("/projects/{project_id}/signals/detect", response_model=SignalDetectionResponse)
async def detect_signals(
    project_id: int,
    request: SignalDetectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Detect signals in a response
    
    Run all enabled signal detectors on the given response text.
    Returns detected signals and overall status (safe/regressed/critical).
    """
    project = check_project_access(project_id, current_user, db)
    
    service = SignalDetectionService(db)
    result = service.detect_all_signals(
        project_id=project_id,
        response_text=request.response_text,
        request_data=request.request_data,
        response_data=request.response_data,
        baseline_data=request.baseline_data,
    )
    
    db.commit()
    
    return result


@router.get("/projects/{project_id}/signals/types")
async def list_signal_types(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get available signal types and their descriptions"""
    project = check_project_access(project_id, current_user, db)
    
    return {
        "signal_types": [
            {
                "type": "hallucination",
                "name": "Hallucination Detection",
                "description": "Detect potential hallucination in responses",
                "default_threshold": 0.7,
            },
            {
                "type": "length_change",
                "name": "Length Change Detection",
                "description": "Detect significant changes in response length",
                "default_threshold": 0.3,
            },
            {
                "type": "refusal_increase",
                "name": "Refusal Detection",
                "description": "Detect refusal patterns in responses",
                "default_threshold": 0.2,
            },
            {
                "type": "json_schema_break",
                "name": "JSON Schema Break",
                "description": "Detect invalid JSON when JSON was expected",
                "default_threshold": 1.0,
            },
            {
                "type": "latency_spike",
                "name": "Latency Spike Detection",
                "description": "Detect significant latency increases",
                "default_threshold": 2.0,
            },
            {
                "type": "tool_misuse",
                "name": "Tool Misuse Detection",
                "description": "Detect tool/function call issues",
                "default_threshold": 0.5,
            },
            {
                "type": "custom",
                "name": "Custom Signal",
                "description": "Create custom detection rules",
                "default_threshold": 0.5,
            },
        ]
    }
