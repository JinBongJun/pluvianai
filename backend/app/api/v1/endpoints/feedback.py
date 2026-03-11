"""
Simple in-app feedback endpoint.

Accepts a short text message from an authenticated user and forwards it
to the operator via email using Resend. No persistence is required for MVP.

Optionally, callers can attach a small screenshot or image as evidence by
using the multipart-based /feedback/with-attachment endpoint. The file is
forwarded to the operator as an email attachment via Resend.
"""

from typing import Optional
import base64

import httpx
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
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


async def _send_feedback_email(
    *,
    message: str,
    page: Optional[str],
    request: Request,
    current_user: User,
    evidence_filename: Optional[str] = None,
    evidence_bytes: Optional[bytes] = None,
) -> None:
    """
    Shared helper to send the feedback email via Resend.
    Optionally attaches a small evidence file.
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
        f"Message:\n{message}\n\n"
        f"Page: {page or 'N/A'}\n"
        f"IP: {ip or 'N/A'}\n"
    )

    email_from_header = f"{settings.EMAIL_FROM_NAME or 'PluvianAI'} <{from_email}>"

    json_payload: dict = {
        "from": email_from_header,
        "to": [to_email],
        "subject": subject,
        "text": text_body,
    }

    if evidence_bytes and evidence_filename:
        # Resend expects base64-encoded attachment content.
        encoded = base64.b64encode(evidence_bytes).decode("ascii")
        json_payload["attachments"] = [
            {
                "filename": evidence_filename,
                "content": encoded,
                # Let email clients and Resend know how to render the file.
                "contentType": "application/octet-stream",
            }
        ]

    try:
        # Use full URL to match Resend documentation exactly
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=json_payload,
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
            extra={"user_id": current_user.id, "page": page},
        )
    except httpx.RequestError as exc:
        logger.error(f"Network error while sending feedback email: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send feedback",
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
    await _send_feedback_email(
        message=payload.message,
        page=payload.page,
        request=request,
        current_user=current_user,
    )


MAX_EVIDENCE_BYTES = 5 * 1024 * 1024  # 5 MiB safety cap for attachments


@router.post("/feedback/with-attachment", status_code=status.HTTP_204_NO_CONTENT)
async def submit_feedback_with_attachment(
    request: Request,
    current_user: User = Depends(get_current_user),
    message: str = Form(..., min_length=5, max_length=5000),
    page: Optional[str] = Form(
        default=None,
        description="Optional path or context where the feedback was sent from.",
    ),
    evidence: Optional[UploadFile] = File(
        default=None,
        description="Optional screenshot or image file attached as evidence.",
    ),
) -> None:
    """
    Multipart variant of the feedback endpoint that allows a small file
    (typically a screenshot) to be attached as evidence. The file is passed
    through to the operator as an email attachment.
    """
    evidence_bytes: Optional[bytes] = None
    evidence_filename: Optional[str] = None

    if evidence is not None:
        contents = await evidence.read()
        if len(contents) > MAX_EVIDENCE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Evidence file is too large. Please attach a file under 5MB.",
            )
        evidence_bytes = contents
        evidence_filename = evidence.filename or "evidence.bin"

    await _send_feedback_email(
        message=message,
        page=page,
        request=request,
        current_user=current_user,
        evidence_filename=evidence_filename,
        evidence_bytes=evidence_bytes,
    )
