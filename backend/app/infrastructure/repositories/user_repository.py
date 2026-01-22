from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.user import User
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository

class UserRepository(SQLAlchemyRepository[User]):
    """User repository with domain-specific queries"""
    
    def __init__(self, db: Session):
        super().__init__(db, User)
    
    def find_by_email(self, email: str) -> Optional[User]:
        """Find user by email"""
        return self.db.query(User).filter(User.email == email).first()
    
    def find_active_by_id(self, id: int) -> Optional[User]:
        """Find active user by ID"""
        return (
            self.db.query(User)
            .filter(and_(User.id == id, User.is_active.is_(True)))
            .first()
        )
