"""
Simple in-app feedback endpoint.

Accepts a short text message from an authenticated user and forwards it
to the operator via email using Resend. No persistence is required for MVP.
"""

from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging_config import logger
from app.core.security import get_current_user
from app.models.user import User


router = APIRouter()


class FeedbackPayload(BaseModel):
    message: str = Field(..., min_length=5, max_length=5000)
    page: Optional[str] = Field(
        default=None,
        description="Optional path or context where the feedback was sent from.",
    )


@router.post("/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def submit_feedback(
    payload: FeedbackPayload,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Receive feedback from an authenticated user and forward it via Resend.
    """
    if not settings.RESEND_API_KEY:
        logger.warning("Feedback endpoint called but RESEND_API_KEY is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Feedback service is not configured",
        )

    # Determine sender and recipient
    from_email = settings.EMAIL_FROM
    to_email = settings.FEEDBACK_TO_EMAIL or settings.EMAIL_FROM

    if not from_email or not to_email:
        logger.warning(
            "Feedback endpoint missing EMAIL_FROM or FEEDBACK_TO_EMAIL configuration"
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Feedback email is not configured",
        )

    ip = request.client.host if request.client else None

    subject = "[PluvianAI] New in-app feedback"
    user_label = f"{current_user.email or 'user'} (id={current_user.id})"

    text_body = (
        f"New feedback submitted from {user_label}\n\n"
        f"Message:\n{payload.message}\n\n"
        f"Page: {payload.page or 'N/A'}\n"
        f"IP: {ip or 'N/A'}\n"
    )

    email_from_header = f"{settings.EMAIL_FROM_NAME or 'PluvianAI'} <{from_email}>"

    try:
        # Use full URL to match Resend documentation exactly
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": email_from_header,
                    "to": [to_email],
                    "subject": subject,
                    "text": text_body,
                },
                timeout=10.0,
            )
        if response.status_code >= 300:
            logger.error(
                "Failed to send feedback email via Resend",
                extra={"status_code": response.status_code, "body": response.text},
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to send feedback",
            )

        logger.info(
            "Feedback email sent successfully",
            extra={"user_id": current_user.id, "page": payload.page},
        )
    except httpx.RequestError as exc:
        logger.error(f"Network error while sending feedback email: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send feedback",
        )
