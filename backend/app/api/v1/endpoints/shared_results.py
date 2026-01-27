"""
Shared Results endpoints for shareable verdict links
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.responses import success_response
from app.core.logging_config import logger
from app.models.user import User
from app.services.shared_result_service import SharedResultService

router = APIRouter()


class ShareResultRequest(BaseModel):
    """Share result request"""
    result_type: str  # 'model_validation', 'snapshot', 'test', etc.
    result_data: dict  # The result data to share
    result_id: Optional[int] = None  # Optional ID of the original result
    expires_in_days: Optional[int] = 30  # Optional expiration (default: 30 days)


@router.post("/projects/{project_id}/results/{result_id}/share")
@handle_errors
async def share_result(
    project_id: int,
    result_id: int,
    request: ShareResultRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a shareable link for a result
    
    Returns a token that can be used to access the result in read-only mode.
    Note: result_id can be 0 if the result doesn't have a persistent ID yet.
    """
    # Verify project access
    check_project_access(project_id, current_user, db)

    service = SharedResultService(db)
    
    try:
        # Use result_id from request if provided, otherwise use path parameter (or 0 if not applicable)
        final_result_id = request.result_id if request.result_id is not None else (result_id if result_id > 0 else None)
        
        shared = service.create_shared_result(
            project_id=project_id,
            created_by=current_user.id,
            result_type=request.result_type,
            result_data=request.result_data,
            result_id=final_result_id,
            expires_in_days=request.expires_in_days,
        )
        
        # Build share URL (frontend will handle routing)
        share_url = f"/shared/{shared.token}"
        
        return success_response(data={
            "token": shared.token,
            "share_url": share_url,
            "expires_at": shared.expires_at.isoformat() if shared.expires_at else None,
        })
    except Exception as e:
        logger.error(f"Failed to create shared result: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create share link"
        )


@router.get("/shared/{token}")
@handle_errors
async def get_shared_result(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Get shared result by token (Guest View - no authentication required)
    
    Returns read-only result data for sharing.
    """
    service = SharedResultService(db)
    shared = service.get_shared_result(token)

    if not shared:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared result not found or expired"
        )

    return success_response(data={
        "result_type": shared.result_type,
        "result_data": shared.result_data,
        "result_id": shared.result_id,
        "project_id": shared.project_id,
        "created_at": shared.created_at.isoformat() if shared.created_at else None,
        "read_only": True,
    })
