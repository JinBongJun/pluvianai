from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class MemberRole(str, Enum):
    """Member role enum"""

    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class ProjectMemberCreate(BaseModel):
    """Project member creation schema"""

    user_email: EmailStr = Field(..., description="User email address")
    role: MemberRole = Field(..., description="Member role (admin, member, viewer)")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in [MemberRole.ADMIN, MemberRole.MEMBER, MemberRole.VIEWER]:
            raise ValueError("Role must be one of: admin, member, viewer")
        return v


class ProjectMemberUpdate(BaseModel):
    """Project member update schema"""

    role: MemberRole = Field(..., description="Member role (admin, member, viewer)")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in [MemberRole.ADMIN, MemberRole.MEMBER, MemberRole.VIEWER]:
            raise ValueError("Role must be one of: admin, member, viewer")
        return v


class ProjectMemberResponse(BaseModel):
    """Project member response schema"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    user_id: int
    user_email: str
    user_name: str | None
    role: str
    created_at: str
