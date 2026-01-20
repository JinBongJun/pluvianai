"""
Webhook endpoints
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.project import Project
from app.models.webhook import Webhook
import secrets
import httpx
import hashlib
import hmac
import json

router = APIRouter()


class WebhookCreate(BaseModel):
    """Webhook creation schema"""

    name: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., description="Webhook URL")
    project_id: Optional[int] = Field(None, description="Optional project ID for project-specific webhooks")
    events: List[str] = Field(..., description="List of events to subscribe to")
    secret: Optional[str] = Field(None, description="Optional webhook secret for signature verification")


class WebhookUpdate(BaseModel):
    """Webhook update schema"""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    url: Optional[str] = None
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None
    secret: Optional[str] = None


class WebhookResponse(BaseModel):
    """Webhook response schema"""

    id: int
    user_id: int
    project_id: int | None
    name: str
    url: str
    events: List[str]
    is_active: bool
    last_triggered_at: str | None
    failure_count: int
    created_at: str

    class Config:
        from_attributes = True


@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    webhook_data: WebhookCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Create a new webhook"""
    # Verify project access if project_id provided
    if webhook_data.project_id:
        check_project_access(webhook_data.project_id, current_user, db)

    # Generate secret if not provided
    secret = webhook_data.secret or secrets.token_urlsafe(32)

    try:
        webhook = Webhook(
            user_id=current_user.id,
            project_id=webhook_data.project_id,
            name=webhook_data.name,
            url=webhook_data.url,
            events=webhook_data.events,
            secret=secret,
            is_active=True,
        )
        db.add(webhook)
        db.commit()
        db.refresh(webhook)

        return WebhookResponse(
            id=webhook.id,
            user_id=webhook.user_id,
            project_id=webhook.project_id,
            name=webhook.name,
            url=webhook.url,
            events=webhook.events,
            is_active=webhook.is_active,
            last_triggered_at=webhook.last_triggered_at.isoformat() if webhook.last_triggered_at else None,
            failure_count=webhook.failure_count,
            created_at=webhook.created_at.isoformat(),
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create webhook: {str(e)}"
        )


@router.get("", response_model=List[WebhookResponse])
async def list_webhooks(
    project_id: Optional[int] = Query(None, description="Filter by project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List webhooks for current user"""
    query = db.query(Webhook).filter(Webhook.user_id == current_user.id)

    if project_id:
        query = query.filter(Webhook.project_id == project_id)

    webhooks = query.order_by(desc(Webhook.created_at)).all()

    return [
        WebhookResponse(
            id=w.id,
            user_id=w.user_id,
            project_id=w.project_id,
            name=w.name,
            url=w.url,
            events=w.events,
            is_active=w.is_active,
            last_triggered_at=w.last_triggered_at.isoformat() if w.last_triggered_at else None,
            failure_count=w.failure_count,
            created_at=w.created_at.isoformat(),
        )
        for w in webhooks
    ]


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(webhook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a specific webhook"""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.user_id == current_user.id).first()

    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    return WebhookResponse(
        id=webhook.id,
        user_id=webhook.user_id,
        project_id=webhook.project_id,
        name=webhook.name,
        url=webhook.url,
        events=webhook.events,
        is_active=webhook.is_active,
        last_triggered_at=webhook.last_triggered_at.isoformat() if webhook.last_triggered_at else None,
        failure_count=webhook.failure_count,
        created_at=webhook.created_at.isoformat(),
    )


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: int,
    webhook_data: WebhookUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a webhook"""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.user_id == current_user.id).first()

    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    if webhook_data.name is not None:
        webhook.name = webhook_data.name
    if webhook_data.url is not None:
        webhook.url = webhook_data.url
    if webhook_data.events is not None:
        webhook.events = webhook_data.events
    if webhook_data.is_active is not None:
        webhook.is_active = webhook_data.is_active
    if webhook_data.secret is not None:
        webhook.secret = webhook_data.secret

    try:
        db.commit()
        db.refresh(webhook)

        return WebhookResponse(
            id=webhook.id,
            user_id=webhook.user_id,
            project_id=webhook.project_id,
            name=webhook.name,
            url=webhook.url,
            events=webhook.events,
            is_active=webhook.is_active,
            last_triggered_at=webhook.last_triggered_at.isoformat() if webhook.last_triggered_at else None,
            failure_count=webhook.failure_count,
            created_at=webhook.created_at.isoformat(),
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update webhook: {str(e)}"
        )


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Delete a webhook"""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.user_id == current_user.id).first()

    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    db.delete(webhook)
    db.commit()
    return None


@router.post("/{webhook_id}/test")
async def test_webhook(webhook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Test a webhook by sending a test event"""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.user_id == current_user.id).first()

    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    if not webhook.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Webhook is not active")

    # Prepare test payload
    payload = {
        "event": "test",
        "timestamp": datetime.utcnow().isoformat(),
        "data": {
            "message": "This is a test webhook from AgentGuard",
            "webhook_id": webhook.id,
            "webhook_name": webhook.name,
        },
    }

    # Sign payload if secret exists
    headers = {"Content-Type": "application/json"}
    if webhook.secret:
        signature = hmac.new(webhook.secret.encode(), json.dumps(payload).encode(), hashlib.sha256).hexdigest()
        headers["X-AgentGuard-Signature"] = f"sha256={signature}"

    # Send webhook
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook.url, json=payload, headers=headers)

            # Update webhook status
            webhook.last_triggered_at = datetime.utcnow()
            if response.status_code >= 400:
                webhook.failure_count += 1
                webhook.last_error = f"HTTP {response.status_code}: {response.text[:200]}"
            else:
                webhook.failure_count = 0
                webhook.last_error = None

            db.commit()

            return {
                "success": response.status_code < 400,
                "status_code": response.status_code,
                "response": response.text[:500] if response.text else None,
            }
    except Exception as e:
        webhook.failure_count += 1
        webhook.last_error = str(e)[:200]
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to send webhook: {str(e)}"
        )
