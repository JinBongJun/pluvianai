"""
Admin user management endpoints
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_admin
from app.core.decorators import handle_errors
from app.core.responses import success_response, paginated_response
from app.core.logging_config import logger
from app.models.user import User

router = APIRouter()


@router.get("/users")
@handle_errors
async def list_users(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List users (superuser only)
    """
    require_admin(current_user)

    # Build query
    query = db.query(User)

    # Apply search filter
    if search:
        search_filter = or_(
            User.email.ilike(f"%{search}%"),
            User.full_name.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)

    # Get total count
    total = query.count()

    # Apply pagination
    users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    # Format response
    user_list = [
        {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "is_superuser": user.is_superuser,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
        for user in users
    ]

    return paginated_response(
        data=user_list,
        page=(offset // limit) + 1,
        per_page=limit,
        total=total,
    )
