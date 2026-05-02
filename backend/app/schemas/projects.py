from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    """Project creation schema (Design 5.1.5)"""

    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: str | None = Field(None, max_length=1000, description="Project description")
    generate_sample_data: bool = Field(False, description="Generate sample data for onboarding")
    organization_id: int | None = Field(None, description="Organization ID this project belongs to")
    usage_mode: str = Field("full", description="Usage mode: 'full' (Live View + Test Lab) or 'test_only' (Test Lab only)")


class ProjectUpdate(BaseModel):
    """Project update schema (Design 5.1.5: usage_mode upgrade)"""

    name: str | None = Field(None, min_length=1, max_length=255, description="Project name")
    description: str | None = Field(None, max_length=1000, description="Project description")
    global_block: bool | None = Field(None, description="Enable global block (panic mode) for this project")
    usage_mode: str | None = Field(None, description="Usage mode: 'full' or 'test_only' (upgrade to Full Mode)")
    diagnostic_config: dict | None = Field(None, description="Diagnostic thresholds for the 12 factors")


class ProjectResponse(BaseModel):
    """Project response schema"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    owner_id: int
    is_active: bool
    role: str | None = None
    org_role: str | None = None
    access_source: str | None = None
    created_by_me: bool | None = None
    has_project_access: bool | None = None
    owner_name: str | None = None
    entitlement_scope: str | None = None
    organization_id: int | None = None
    usage_mode: str = "full"
    diagnostic_config: dict | None = {}


class PanicModeUpdate(BaseModel):
    """Panic mode update schema"""

    enabled: bool


class PanicModeResponse(BaseModel):
    """Panic mode response schema"""

    project_id: int
    enabled: bool


class RubricCreate(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    criteria_prompt: str
    min_score: int = 1
    max_score: int = 5


class RubricResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    criteria_prompt: str
    min_score: int
    max_score: int
    is_active: bool


class ProjectPatch(BaseModel):
    """Schema for applying a configuration patch from Test Lab"""

    nodes: List[dict] = Field(..., description="List of nodes in the patched configuration")
    edges: List[dict] = Field(..., description="List of edges in the patched configuration")
    version: str | None = Field(None, description="Optional version name for the patch")
