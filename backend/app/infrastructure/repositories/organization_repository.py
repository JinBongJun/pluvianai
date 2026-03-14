from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.organization import Organization
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository

class OrganizationRepository(SQLAlchemyRepository[Organization]):
    """Organization repository"""
    
    def __init__(self, db: Session):
        super().__init__(db, Organization)
    
    def find_by_owner_id(self, owner_id: int) -> List[Organization]:
        """Find organizations owned by user"""
        return (
            self.db.query(Organization)
            .filter(
                and_(
                    Organization.owner_id == owner_id,
                    Organization.is_deleted.is_(False),
                )
            )
            .all()
        )
