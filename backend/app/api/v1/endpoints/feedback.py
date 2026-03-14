"""
Simple in-app feedback endpoint.

Accepts a short text message from an authenticated user and forwards it
to the operator via Slack (if FEEDBACK_SLACK_WEBHOOK_URL is set) or via
email using Resend. No persistence is required for MVP.

Optionally, callers can attach a small screenshot or image as evidence by
using the multipart-based /feedback/with-attachment endpoint. With Slack:
if FEEDBACK_SLACK_BOT_TOKEN and FEEDBACK_SLACK_CHANNEL_ID are set, the file
is uploaded to that channel via Slack Web API; otherwise only the filename
is noted in the message. With Resend, the file is sent as an email attachment.
"""

from typing import Optional
import base64
import mimetypes

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


def _feedback_body(
    *,
    message: str,
    page: Optional[str],
    request: Request,
    current_user: User,
    evidence_filename: Optional[str] = None,
    attachment_sent: bool = False,
) -> str:
    ip = request.client.host if request.client else None
    user_label = f"{current_user.email or 'user'} (id={current_user.id})"
    lines = [
        f"New feedback from {user_label}",
        "",
        f"Message:\n{message}",
        "",
        f"Page: {page or 'N/A'}",
        f"IP: {ip or 'N/A'}",
    ]
    if evidence_filename:
        lines.append(f"Attachment: {evidence_filename}" + (" (see file below)" if attachment_sent else " (not sent to Slack)"))
    return "\n".join(lines)


async def _upload_feedback_file_to_slack(
    *,
    evidence_filename: str,
    evidence_bytes: bytes,
    initial_comment: str,
) -> None:
    """
    Upload a file to Slack using getUploadURLExternal -> POST file -> completeUploadExternal.
    Requires FEEDBACK_SLACK_BOT_TOKEN and FEEDBACK_SLACK_CHANNEL_ID with scope files:write.
    """
    token = settings.FEEDBACK_SLACK_BOT_TOKEN
    channel_id = settings.FEEDBACK_SLACK_CHANNEL_ID
    if not token or not channel_id:
        logger.warning("Slack file upload skipped: FEEDBACK_SLACK_BOT_TOKEN or FEEDBACK_SLACK_CHANNEL_ID not set")
        return
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    }
    # 1) Get upload URL (Slack expects form-urlencoded for this endpoint)
    async with httpx.AsyncClient() as client:
        get_resp = await client.post(
            "https://slack.com/api/files.getUploadURLExternal",
            headers=headers,
            data={
                "filename": evidence_filename,
                "length": str(len(evidence_bytes)),
            },
            timeout=10.0,
        )
    if get_resp.status_code >= 300:
        logger.error("Slack getUploadURLExternal failed", extra={"status": get_resp.status_code, "body": get_resp.text})
        return
    data = get_resp.json()
    if not data.get("ok"):
        logger.error("Slack getUploadURLExternal error", extra={"error": data.get("error"), "body": data})
        return
    upload_url = data.get("upload_url")
    file_id = data.get("file_id")
    if not upload_url or not file_id:
        logger.error("Slack getUploadURLExternal missing upload_url or file_id", extra={"data": data})
        return
    # 2) POST file to upload URL (multipart/form-data; Slack expects "filename" field)
    content_type = mimetypes.guess_type(evidence_filename)[0] or "application/octet-stream"
    files = {"filename": (evidence_filename, evidence_bytes, content_type)}
    async with httpx.AsyncClient() as client:
        put_resp = await client.post(
            upload_url,
            files=files,
            timeout=30.0,
        )
    if put_resp.status_code >= 300:
        logger.error("Slack file POST to upload_url failed", extra={"status": put_resp.status_code, "body": put_resp.text})
        return
    # 3) Complete upload and share to channel (JSON body; do not reuse form-urlencoded headers)
    complete_headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        complete_resp = await client.post(
            "https://slack.com/api/files.completeUploadExternal",
            headers=complete_headers,
            json={
                "files": [{"id": file_id, "title": evidence_filename}],
                "channel_id": channel_id,
                "initial_comment": initial_comment or "Feedback attachment",
            },
            timeout=10.0,
        )
    if complete_resp.status_code >= 300:
        logger.error(
            "Slack completeUploadExternal failed",
            extra={"status": complete_resp.status_code, "body": complete_resp.text},
        )
        return
    complete_data = complete_resp.json()
    if not complete_data.get("ok"):
        logger.error("Slack completeUploadExternal error", extra={"error": complete_data.get("error"), "body": complete_data})
        return
    logger.info("Feedback attachment uploaded to Slack", extra={"file_id": file_id, "evidence_filename": evidence_filename})


async def _send_feedback_slack(
    *,
    message: str,
    page: Optional[str],
    request: Request,
    current_user: User,
    evidence_filename: Optional[str] = None,
    evidence_bytes: Optional[bytes] = None,
) -> None:
    """Post feedback to Slack via Incoming Webhook. If attachment and Bot Token+channel are set, upload file via Slack Web API."""
    url = settings.FEEDBACK_SLACK_WEBHOOK_URL
    if not url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Feedback Slack webhook is not configured",
        )
    can_upload_file = bool(
        evidence_filename
        and evidence_bytes
        and settings.FEEDBACK_SLACK_BOT_TOKEN
        and settings.FEEDBACK_SLACK_CHANNEL_ID
    )
    text = _feedback_body(
        message=message,
        page=page,
        request=request,
        current_user=current_user,
        evidence_filename=evidence_filename,
        attachment_sent=can_upload_file,
    )
    payload = {"text": f"[PluvianAI] In-app feedback\n\n{text}"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                timeout=10.0,
            )
        if response.status_code >= 300:
            logger.error(
                "Failed to send feedback to Slack",
                extra={"status_code": response.status_code, "body": response.text},
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to send feedback",
            )
        logger.info(
            "Feedback sent to Slack",
            extra={"user_id": current_user.id, "page": page},
        )
    except httpx.RequestError as exc:
        logger.error(f"Network error while sending feedback to Slack: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send feedback",
        )
    # Upload attachment to same channel if Bot Token + channel are configured.
    # Do not let upload failure (or any exception) cause 500; feedback text is already in Slack.
    if can_upload_file and evidence_filename and evidence_bytes:
        try:
            await _upload_feedback_file_to_slack(
                evidence_filename=evidence_filename,
                evidence_bytes=evidence_bytes,
                initial_comment="Feedback attachment from in-app form",
            )
        except Exception as e:
            logger.exception(
                "Slack attachment upload failed; feedback text was still sent",
                extra={"user_id": current_user.id, "evidence_filename": evidence_filename},
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


async def _deliver_feedback(
    *,
    message: str,
    page: Optional[str],
    request: Request,
    current_user: User,
    evidence_filename: Optional[str] = None,
    evidence_bytes: Optional[bytes] = None,
) -> None:
    """Send feedback to Slack (if configured) or Resend. Prefer Slack when both are set."""
    if settings.FEEDBACK_SLACK_WEBHOOK_URL:
        await _send_feedback_slack(
            message=message,
            page=page,
            request=request,
            current_user=current_user,
            evidence_filename=evidence_filename,
            evidence_bytes=evidence_bytes,
        )
        return
    if settings.RESEND_API_KEY and (settings.EMAIL_FROM or settings.FEEDBACK_TO_EMAIL):
        await _send_feedback_email(
            message=message,
            page=page,
            request=request,
            current_user=current_user,
            evidence_filename=evidence_filename,
            evidence_bytes=evidence_bytes,
        )
        return
    logger.warning("Feedback endpoint called but neither FEEDBACK_SLACK_WEBHOOK_URL nor Resend is configured")
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Feedback service is not configured. Set FEEDBACK_SLACK_WEBHOOK_URL or RESEND_API_KEY.",
    )


@router.post("/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def submit_feedback(
    payload: FeedbackPayload,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Receive feedback from an authenticated user and forward it to Slack or Resend.
    """
    await _deliver_feedback(
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

    await _deliver_feedback(
        message=message,
        page=page,
        request=request,
        current_user=current_user,
        evidence_filename=evidence_filename,
        evidence_bytes=evidence_bytes,
    )
