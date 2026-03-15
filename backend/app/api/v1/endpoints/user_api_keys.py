"""
User API Key endpoints for managing user-provided API keys
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.core.decorators import handle_errors
from app.core.responses import success_response
from app.core.logging_config import logger
from app.core.dependencies import get_audit_service
from app.models.user import User
from app.services.user_api_key_service import UserApiKeyService

router = APIRouter()


class CreateUserApiKeyRequest(BaseModel):
    """Create user API key request"""
    provider: str  # openai, anthropic, google
    api_key: str  # Plain API key (will be encrypted)
    name: Optional[str] = None
    agent_id: Optional[str] = None


class UserApiKeyResponse(BaseModel):
    """User API key response (without decrypted key)"""
    id: int
    project_id: int
    agent_id: Optional[str]
    provider: str
    name: Optional[str]
    is_active: bool
    created_at: str
    key_hint: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("")
@handle_errors
async def create_user_api_key(
    project_id: int,
    request: CreateUserApiKeyRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service),
):
    """
    Create/update user API key for a project
    
    The API key will be encrypted before storage.
    """
    # Verify project access (owner/admin only for mutations)
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])

    # Validate provider
    if request.provider not in ["openai", "anthropic", "google"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid provider. Must be one of: openai, anthropic, google"
        )

    service = UserApiKeyService(db)
    
    try:
        user_key = service.create_user_api_key(
            project_id=project_id,
            user_id=current_user.id,
            provider=request.provider,
            api_key=request.api_key,
            name=request.name,
            agent_id=(request.agent_id or "").strip() or None,
        )
        
        # Log audit event
        ip_address = http_request.client.host if http_request and http_request.client else None
        user_agent = http_request.headers.get("user-agent") if http_request else None
        audit_service.log_action(
            user_id=current_user.id,
            action="user_api_key_created",
            resource_type="user_api_key",
            resource_id=user_key.id,
            new_value={
                "project_id": project_id,
                "provider": request.provider,
                "name": request.name,
                "agent_id": (request.agent_id or "").strip() or None,
            },
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return success_response(data={
            "id": user_key.id,
            "project_id": user_key.project_id,
            "agent_id": user_key.agent_id,
            "provider": user_key.provider,
            "name": user_key.name,
            "is_active": user_key.is_active,
            "created_at": user_key.created_at.isoformat() if user_key.created_at else None,
            "key_hint": getattr(user_key, "key_hint", None),
        })
    except Exception as e:
        logger.error(f"Failed to create user API key: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user API key"
        )


@router.get("", response_model=List[UserApiKeyResponse])
@handle_errors
async def list_user_api_keys(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List user API keys for a project (encrypted, not decrypted)
    """
    # Verify project access
    check_project_access(project_id, current_user, db)

    service = UserApiKeyService(db)
    keys = service.list_user_api_keys(project_id)

    return [
        UserApiKeyResponse(
            id=k.id,
            project_id=k.project_id,
            agent_id=k.agent_id,
            provider=k.provider,
            name=k.name,
            is_active=k.is_active,
            created_at=k.created_at.isoformat() if k.created_at else "",
            key_hint=getattr(k, "key_hint", None),
        )
        for k in keys
    ]


@router.delete("/{key_id}")
@handle_errors
async def delete_user_api_key(
    project_id: int,
    key_id: int,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service),
):
    """
    Delete (deactivate) a user API key
    """
    # Verify project access (owner/admin only for mutations)
    check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])

    service = UserApiKeyService(db)
    
    # Get key info before deletion for audit log
    keys = service.list_user_api_keys(project_id)
    key_to_delete = next((k for k in keys if k.id == key_id), None)
    
    deleted = service.delete_user_api_key(key_id, current_user.id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User API key not found"
        )

    # Log audit event
    ip_address = http_request.client.host if http_request and http_request.client else None
    user_agent = http_request.headers.get("user-agent") if http_request else None
    old_value = {
        "key_id": key_id,
        "project_id": project_id,
        "provider": key_to_delete.provider if key_to_delete else None,
        "agent_id": key_to_delete.agent_id if key_to_delete else None,
    }
    audit_service.log_action(
        user_id=current_user.id,
        action="user_api_key_deleted",
        resource_type="user_api_key",
        resource_id=key_id,
        old_value=old_value,
        ip_address=ip_address,
        user_agent=user_agent
    )

    return success_response(data={"message": "User API key deleted"})
