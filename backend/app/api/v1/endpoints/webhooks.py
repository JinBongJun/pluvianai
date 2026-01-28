"""
Webhooks endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.webhook import Webhook
from datetime import datetime
import httpx
import secrets

router = APIRouter()


class WebhookResponse(BaseModel):
    """Webhook response schema"""
    id: int
    user_id: int
    project_id: Optional[int]
    name: str
    url: str
    secret: Optional[str]
    events: List[str]
    is_active: bool
    last_triggered_at: Optional[str]
    failure_count: int
    last_error: Optional[str]
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class CreateWebhookRequest(BaseModel):
    """Create webhook request"""
    name: str
    url: str
    events: List[str]
    project_id: Optional[int] = None
    secret: Optional[str] = None


class UpdateWebhookRequest(BaseModel):
    """Update webhook request"""
    name: Optional[str] = None
    url: Optional[str] = None
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None
    secret: Optional[str] = None


@router.get("", response_model=List[WebhookResponse])
@handle_errors
async def list_webhooks(
    project_id: Optional[int] = Query(None, description="Filter by project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List webhooks for the current user
    """
    logger.info(
        f"User {current_user.id} requested webhooks list (project_id: {project_id})",
        extra={"user_id": current_user.id, "project_id": project_id}
    )
    
    # Build query
    query = db.query(Webhook).filter(Webhook.user_id == current_user.id)

    # Filter by project if provided
    if project_id:
        # Verify project access
        check_project_access(project_id, current_user, db)
        query = query.filter(Webhook.project_id == project_id)

    webhooks = query.order_by(desc(Webhook.created_at)).all()

    logger.info(
        f"Webhooks retrieved for user {current_user.id}: {len(webhooks)} webhooks",
        extra={"user_id": current_user.id, "count": len(webhooks)}
    )

    return [WebhookResponse(
        id=w.id,
        user_id=w.user_id,
        project_id=w.project_id,
        name=w.name,
        url=w.url,
        secret=w.secret,  # Note: In production, consider not returning secret
        events=w.events if isinstance(w.events, list) else [],
        is_active=w.is_active,
        last_triggered_at=w.last_triggered_at.isoformat() if w.last_triggered_at else None,
        failure_count=w.failure_count,
        last_error=w.last_error,
        created_at=w.created_at.isoformat() if w.created_at else "",
        updated_at=w.updated_at.isoformat() if w.updated_at else None,
    ) for w in webhooks]


@router.get("/{webhook_id}", response_model=WebhookResponse)
@handle_errors
async def get_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a specific webhook
    """
    logger.info(
        f"User {current_user.id} requested webhook {webhook_id}",
        extra={"user_id": current_user.id, "webhook_id": webhook_id}
    )
    
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )

    return WebhookResponse(
        id=webhook.id,
        user_id=webhook.user_id,
        project_id=webhook.project_id,
        name=webhook.name,
        url=webhook.url,
        secret=webhook.secret,
        events=webhook.events if isinstance(webhook.events, list) else [],
        is_active=webhook.is_active,
        last_triggered_at=webhook.last_triggered_at.isoformat() if webhook.last_triggered_at else None,
        failure_count=webhook.failure_count,
        last_error=webhook.last_error,
        created_at=webhook.created_at.isoformat() if webhook.created_at else "",
        updated_at=webhook.updated_at.isoformat() if webhook.updated_at else None,
    )


@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
@handle_errors
async def create_webhook(
    request: CreateWebhookRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new webhook
    """
    logger.info(
        f"User {current_user.id} creating webhook: {request.name}",
        extra={"user_id": current_user.id, "name": request.name, "project_id": request.project_id}
    )
    
    # Verify project access if project_id is provided
    if request.project_id:
        check_project_access(request.project_id, current_user, db)

    # Generate secret if not provided
    secret = request.secret or secrets.token_urlsafe(32)

    # Create webhook
    webhook = Webhook(
        user_id=current_user.id,
        project_id=request.project_id,
        name=request.name,
        url=request.url,
        secret=secret,
        events=request.events,
        is_active=True,
    )

    db.add(webhook)
    # Note: get_db() dependency automatically commits, so db.commit() is not needed
    db.refresh(webhook)

    logger.info(
        f"Webhook created: {webhook.id}",
        extra={"user_id": current_user.id, "webhook_id": webhook.id}
    )

    return WebhookResponse(
        id=webhook.id,
        user_id=webhook.user_id,
        project_id=webhook.project_id,
        name=webhook.name,
        url=webhook.url,
        secret=webhook.secret,
        events=webhook.events if isinstance(webhook.events, list) else [],
        is_active=webhook.is_active,
        last_triggered_at=webhook.last_triggered_at.isoformat() if webhook.last_triggered_at else None,
        failure_count=webhook.failure_count,
        last_error=webhook.last_error,
        created_at=webhook.created_at.isoformat() if webhook.created_at else "",
        updated_at=webhook.updated_at.isoformat() if webhook.updated_at else None,
    )


@router.patch("/{webhook_id}", response_model=WebhookResponse)
@handle_errors
async def update_webhook(
    webhook_id: int,
    request: UpdateWebhookRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update a webhook
    """
    logger.info(
        f"User {current_user.id} updating webhook {webhook_id}",
        extra={"user_id": current_user.id, "webhook_id": webhook_id}
    )
    
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )

    # Update fields
    if request.name is not None:
        webhook.name = request.name
    if request.url is not None:
        webhook.url = request.url
    if request.events is not None:
        webhook.events = request.events
    if request.is_active is not None:
        webhook.is_active = request.is_active
    if request.secret is not None:
        webhook.secret = request.secret

    # Note: get_db() dependency automatically commits, so db.commit() is not needed
    db.refresh(webhook)

    logger.info(
        f"Webhook updated: {webhook_id}",
        extra={"user_id": current_user.id, "webhook_id": webhook_id}
    )

    return WebhookResponse(
        id=webhook.id,
        user_id=webhook.user_id,
        project_id=webhook.project_id,
        name=webhook.name,
        url=webhook.url,
        secret=webhook.secret,
        events=webhook.events if isinstance(webhook.events, list) else [],
        is_active=webhook.is_active,
        last_triggered_at=webhook.last_triggered_at.isoformat() if webhook.last_triggered_at else None,
        failure_count=webhook.failure_count,
        last_error=webhook.last_error,
        created_at=webhook.created_at.isoformat() if webhook.created_at else "",
        updated_at=webhook.updated_at.isoformat() if webhook.updated_at else None,
    )


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def delete_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete a webhook
    """
    logger.info(
        f"User {current_user.id} deleting webhook {webhook_id}",
        extra={"user_id": current_user.id, "webhook_id": webhook_id}
    )
    
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )

    db.delete(webhook)
    # Note: get_db() dependency automatically commits, so db.commit() is not needed

    logger.info(
        f"Webhook deleted: {webhook_id}",
        extra={"user_id": current_user.id, "webhook_id": webhook_id}
    )

    return None


@router.post("/{webhook_id}/test")
@handle_errors
async def test_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Test a webhook by sending a test event
    """
    logger.info(
        f"User {current_user.id} testing webhook {webhook_id}",
        extra={"user_id": current_user.id, "webhook_id": webhook_id}
    )
    
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )

    if not webhook.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook is not active"
        )

    # Send test event
    test_payload = {
        "event": "webhook_test",
        "timestamp": datetime.utcnow().isoformat(),
        "data": {
            "message": "This is a test webhook event from AgentGuard",
            "webhook_id": webhook.id,
            "webhook_name": webhook.name,
        }
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                webhook.url,
                json=test_payload,
                headers={
                    "Content-Type": "application/json",
                    "X-AgentGuard-Event": "webhook_test",
                    "X-AgentGuard-Webhook-ID": str(webhook.id),
                }
            )
            response.raise_for_status()

        # Update webhook stats
        webhook.last_triggered_at = datetime.utcnow()
        webhook.failure_count = 0
        webhook.last_error = None
        # Note: get_db() dependency automatically commits, so db.commit() is not needed

        logger.info(
            f"Webhook test successful: {webhook_id}",
            extra={"user_id": current_user.id, "webhook_id": webhook_id, "status_code": response.status_code}
        )

        return success_response(data={
            "status": "success",
            "message": "Webhook test successful",
            "status_code": response.status_code,
        })

    except Exception as e:
        # Update webhook stats
        webhook.failure_count += 1
        webhook.last_error = str(e)
        # Note: get_db() dependency automatically commits, so db.commit() is not needed

        logger.error(
            f"Webhook test failed: {webhook_id}",
            extra={"user_id": current_user.id, "webhook_id": webhook_id, "error": str(e)},
            exc_info=True
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Webhook test failed: {str(e)}"
        )
