from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.infrastructure.repositories.project_repository import ProjectRepository
from app.infrastructure.repositories.user_repository import UserRepository
from app.infrastructure.repositories.api_call_repository import APICallRepository
from app.infrastructure.repositories.alert_repository import AlertRepository
from app.infrastructure.repositories.organization_repository import OrganizationRepository

def get_project_repository(db: Session = Depends(get_db)) -> ProjectRepository:
    """
    Get project repository
    
    Note: Repository uses the same session from get_db().
    Transaction commit/rollback is handled by get_db() automatically.
    """
    return ProjectRepository(db)

def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    """Get user repository"""
    return UserRepository(db)

def get_api_call_repository(db: Session = Depends(get_db)) -> APICallRepository:
    """Get API call repository"""
    return APICallRepository(db)

def get_alert_repository(db: Session = Depends(get_db)) -> AlertRepository:
    """Get alert repository"""
    return AlertRepository(db)

def get_organization_repository(db: Session = Depends(get_db)) -> OrganizationRepository:
    """Get organization repository"""
    return OrganizationRepository(db)
