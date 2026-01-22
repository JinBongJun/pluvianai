from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.project import Project
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository

class ProjectRepository(SQLAlchemyRepository[Project]):
    """Project repository with domain-specific queries"""
    
    def __init__(self, db: Session):
        super().__init__(db, Project)
    
    def find_by_user_id(self, user_id: int) -> List[Project]:
        """Find all projects owned by user"""
        return (
            self.db.query(Project)
            .filter(and_(Project.owner_id == user_id, Project.is_active.is_(True)))
            .all()
        )
    
    def find_by_name_and_owner(self, name: str, owner_id: int) -> Optional[Project]:
        """Find project by name and owner"""
        return (
            self.db.query(Project)
            .filter(
                and_(
                    Project.name == name,
                    Project.owner_id == owner_id,
                    Project.is_active.is_(True)
                )
            )
            .first()
        )
    
    def find_by_organization_id(self, organization_id: int) -> List[Project]:
        """Find all projects in organization"""
        return (
            self.db.query(Project)
            .filter(
                and_(
                    Project.organization_id == organization_id,
                    Project.is_active.is_(True)
                )
            )
            .all()
        )
