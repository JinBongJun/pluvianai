from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.project_member import ProjectMember
from app.infrastructure.repositories.project_member_repository import ProjectMemberRepository
from app.infrastructure.repositories.user_repository import UserRepository
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError
from app.core.logging_config import logger


class ProjectMemberService:
    """Service for project member management business logic"""

    def __init__(
        self,
        member_repo: ProjectMemberRepository,
        user_repo: UserRepository,
        db: Session
    ):
        self.member_repo = member_repo
        self.user_repo = user_repo
        self.db = db

    def add_member(
        self,
        project_id: int,
        user_email: str,
        role: str
    ) -> ProjectMember:
        """
        Add a member to project
        
        Args:
            project_id: Project ID
            user_email: User email to add
            role: Member role (admin, member, viewer)
        
        Returns:
            Created ProjectMember entity
        
        Raises:
            ValueError: If user not found
            EntityAlreadyExistsError: If user is already a member
        """
        # Find user by email
        user = self.user_repo.find_by_email(user_email)
        if not user:
            raise ValueError(f"User with email '{user_email}' not found")

        # Check if already a member
        existing = self.member_repo.find_by_project_and_user(project_id, user.id)
        if existing:
            raise EntityAlreadyExistsError("User is already a member of this project")

        # Create member
        member = ProjectMember(
            project_id=project_id,
            user_id=user.id,
            role=role
        )
        return self.member_repo.save(member)

    def remove_member(self, project_id: int, user_id: int) -> bool:
        """
        Remove a member from project
        
        Args:
            project_id: Project ID
            user_id: User ID to remove
        
        Returns:
            True if removed, False if not found
        """
        member = self.member_repo.find_by_project_and_user(project_id, user_id)
        if not member:
            return False
        
        self.db.delete(member)
        # Transaction is managed by get_db() dependency
        return True

    def update_member_role(
        self,
        project_id: int,
        user_id: int,
        new_role: str
    ) -> Optional[ProjectMember]:
        """
        Update member role
        
        Args:
            project_id: Project ID
            user_id: User ID
            new_role: New role
        
        Returns:
            Updated ProjectMember or None if not found
        """
        member = self.member_repo.find_by_project_and_user(project_id, user_id)
        if not member:
            return None
        
        member.role = new_role
        return self.member_repo.save(member)

    def get_members_by_project_id(self, project_id: int) -> List[ProjectMember]:
        """Get all members of a project"""
        return self.member_repo.find_by_project_id(project_id)

    def get_projects_by_user_id(self, user_id: int) -> List[ProjectMember]:
        """Get all projects where user is a member"""
        return self.member_repo.find_by_user_id(user_id)
