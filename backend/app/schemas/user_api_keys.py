from typing import Optional

from pydantic import BaseModel, ConfigDict


class CreateUserApiKeyRequest(BaseModel):
    """Create user API key request"""

    provider: str  # openai, anthropic, google
    api_key: str  # Plain API key (will be encrypted)
    name: Optional[str] = None
    agent_id: Optional[str] = None


class UserApiKeyResponse(BaseModel):
    """User API key response (without decrypted key)"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    agent_id: Optional[str]
    provider: str
    name: Optional[str]
    is_active: bool
    created_at: str
    key_hint: Optional[str] = None
