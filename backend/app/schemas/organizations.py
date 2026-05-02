from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    # Public plans: free, starter, pro, enterprise (billing is account-level; org stores label)
    plan_type: str = Field("free", pattern="^(free|starter|pro|enterprise)$")


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)


class OrganizationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    plan_type: str
    projects_count: int
    calls_7d: int
    cost_7d: float
    alerts_open: int
    drift_projects: int
    current_user_role: Optional[str] = None
    membership_source: Optional[str] = None


class OrganizationUsage(BaseModel):
    calls: int = 0
    calls_limit: int = 0
    cost: float = 0.0
    cost_limit: float = 0.0
    quality: float = 0.0


class OrganizationAlert(BaseModel):
    project: Optional[str] = None
    summary: Optional[str] = None
    severity: Optional[str] = None


class OrganizationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    type: Optional[str] = None  # Deprecated: use plan_type. Kept for backward compatibility.
    plan_type: str
    stats: Optional[dict] = None  # For backward compatibility
    current_user_role: Optional[str] = None
    membership_source: Optional[str] = None


class OrgProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    calls_24h: int
    cost_7d: float
    quality: Optional[float]
    alerts_open: int
    drift: bool
    role: Optional[str] = None
    org_role: Optional[str] = None
    access_source: Optional[str] = None
    created_by_me: Optional[bool] = None
    has_project_access: Optional[bool] = None
    owner_name: Optional[str] = None
    entitlement_scope: Optional[str] = None


class OrganizationMemberRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class OrganizationMemberCreate(BaseModel):
    email: EmailStr
    role: OrganizationMemberRole = Field(..., description="Member role (admin, member, viewer)")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in [
            OrganizationMemberRole.ADMIN,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.VIEWER,
        ]:
            raise ValueError("Role must be one of: admin, member, viewer")
        return v


class OrganizationMemberResponse(BaseModel):
    id: int
    user_id: int
    email: str
    full_name: Optional[str] = None
    role: str
    joined_at: str
