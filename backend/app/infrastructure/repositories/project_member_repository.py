from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.project_member import ProjectMember
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository


class ProjectMemberRepository(SQLAlchemyRepository[ProjectMember]):
    """ProjectMember repository with domain-specific queries"""

    def __init__(self, db: Session):
        super().__init__(db, ProjectMember)

    def find_by_project_id(self, project_id: int) -> List[ProjectMember]:
        """Find all members of a project"""
        return (
            self.db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id)
            .all()
        )

    def find_by_user_id(self, user_id: int) -> List[ProjectMember]:
        """Find all projects where user is a member"""
        return (
            self.db.query(ProjectMember)
            .filter(ProjectMember.user_id == user_id)
            .all()
        )

    def find_by_project_and_user(
        self, project_id: int, user_id: int
    ) -> Optional[ProjectMember]:
        """Find specific member in project"""
        return (
            self.db.query(ProjectMember)
            .filter(
                and_(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user_id
                )
            )
            .first()
        )

    def find_by_project_and_role(
        self, project_id: int, role: str
    ) -> List[ProjectMember]:
        """Find all members with specific role in project"""
        return (
            self.db.query(ProjectMember)
            .filter(
                and_(
                    ProjectMember.project_id == project_id,
                    ProjectMember.role == role
                )
            )
            .all()
        )
