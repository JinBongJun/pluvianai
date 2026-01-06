"""
Data archiving endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.models.user import User
from app.models.project import Project
from app.services.archiving_service import archiving_service

router = APIRouter()


@router.post("/archive")
async def archive_old_data(
    project_id: Optional[int] = Query(None, description="Optional project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Archive old data (admin only or project owner)
    """
    # Verify project access if project_id provided (owner/admin only)
    if project_id:
        project = check_project_access(
            project_id, current_user, db,
            required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN]
        )
    
    # Archive old data
    stats = archiving_service.archive_old_data(project_id=project_id)
    
    return {
        "message": "Data archived successfully",
        "stats": stats
    }


@router.get("/stats")
async def get_storage_stats(
    project_id: Optional[int] = Query(None, description="Optional project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get storage statistics
    """
    # Verify project access if project_id provided (any member can view stats)
    if project_id:
        project = check_project_access(project_id, current_user, db)
    
    stats = archiving_service.get_storage_stats(project_id=project_id)
    
    return stats


