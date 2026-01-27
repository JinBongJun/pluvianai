from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.organization import OrganizationMember
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository


class OrganizationMemberRepository(SQLAlchemyRepository[OrganizationMember]):
    """OrganizationMember repository with domain-specific queries"""

    def __init__(self, db: Session):
        super().__init__(db, OrganizationMember)

    def find_by_organization_id(self, organization_id: int) -> List[OrganizationMember]:
        """Find all members of an organization"""
        return (
            self.db.query(OrganizationMember)
            .filter(OrganizationMember.organization_id == organization_id)
            .all()
        )

    def find_by_user_id(self, user_id: int) -> List[OrganizationMember]:
        """Find all organizations where user is a member"""
        return (
            self.db.query(OrganizationMember)
            .filter(OrganizationMember.user_id == user_id)
            .all()
        )

    def find_by_organization_and_user(
        self, organization_id: int, user_id: int
    ) -> Optional[OrganizationMember]:
        """Find specific member in organization"""
        return (
            self.db.query(OrganizationMember)
            .filter(
                and_(
                    OrganizationMember.organization_id == organization_id,
                    OrganizationMember.user_id == user_id
                )
            )
            .first()
        )

    def find_by_organization_and_role(
        self, organization_id: int, role: str
    ) -> List[OrganizationMember]:
        """Find all members with specific role in organization"""
        return (
            self.db.query(OrganizationMember)
            .filter(
                and_(
                    OrganizationMember.organization_id == organization_id,
                    OrganizationMember.role == role
                )
            )
            .all()
        )
