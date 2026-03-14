from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.project import Project
from app.models.organization import Organization, OrganizationMember
from app.infrastructure.repositories.project_repository import ProjectRepository
from app.infrastructure.repositories.organization_repository import OrganizationRepository
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError
from app.core.logging_config import logger


class ProjectService:
    """Service for project management business logic"""

    def __init__(
        self,
        project_repo: ProjectRepository,
        org_repo: OrganizationRepository,
        db: Session
    ):
        self.project_repo = project_repo
        self.org_repo = org_repo
        self.db = db

    def create_project(
        self,
        name: str,
        owner_id: int,
        description: Optional[str] = None,
        organization_id: Optional[int] = None,
        usage_mode: str = "full",
    ) -> Project:
        """
        Create a new project (Design 5.1.5: usage_mode full | test_only).

        Args:
            name: Project name
            owner_id: Owner user ID
            description: Optional project description
            organization_id: Optional organization ID
            usage_mode: "full" (Live View + Test Lab) or "test_only" (Test Lab only)

        Returns:
            Created Project entity

        Raises:
            EntityAlreadyExistsError: If project name already exists for owner
        """
        # Check for duplicate project name
        existing = self.project_repo.find_by_name_and_owner(name, owner_id)
        if existing:
            raise EntityAlreadyExistsError("A project with this name already exists")

        # Verify organization access if organization_id is provided
        if organization_id:
            org = self.org_repo.find_by_id(organization_id)
            if not org or org.is_deleted:
                raise ValueError("Organization not found")
            
            # Check if user is owner or member
            is_owner = org.owner_id == owner_id
            if not is_owner:
                # Check membership
                member = (
                    self.db.query(OrganizationMember)
                    .filter(
                        OrganizationMember.organization_id == organization_id,
                        OrganizationMember.user_id == owner_id
                    )
                    .first()
                )
                if not member:
                    raise ValueError("You don't have access to this organization")

        mode = "full" if usage_mode not in ("full", "test_only") else usage_mode
        project = Project(
            name=name,
            description=description,
            owner_id=owner_id,
            is_active=True,
            organization_id=organization_id,
            usage_mode=mode,
        )
        
        # Transaction is managed by get_db() dependency
        return self.project_repo.save(project)

    def get_project_by_id(self, project_id: int) -> Optional[Project]:
        """Get project by ID"""
        project = self.project_repo.find_by_id(project_id)
        if not project or not project.is_active or project.is_deleted:
            return None
        return project

    def get_projects_by_user_id(self, user_id: int) -> List[Project]:
        """Get all projects owned by user"""
        return self.project_repo.find_by_user_id(user_id)

    def get_projects_by_organization_id(self, organization_id: int) -> List[Project]:
        """Get all projects in organization"""
        return self.project_repo.find_by_organization_id(organization_id)

    def get_projects_for_user(
        self,
        user_id: int,
        search: Optional[str] = None
    ) -> List[Project]:
        """
        Get all projects where user is owner or member
        
        Args:
            user_id: User ID
            search: Optional search term for project name/description
        
        Returns:
            List of Project entities
        """
        from sqlalchemy import or_
        from app.models.project_member import ProjectMember
        
        # Get owned projects
        owned_query = self.db.query(Project).filter(
            Project.owner_id == user_id,
            Project.is_active.is_(True)
        )
        
        # Get member projects
        member_query = (
            self.db.query(Project)
            .join(ProjectMember)
            .filter(ProjectMember.user_id == user_id, Project.is_active.is_(True))
        )
        
        # Apply search filter if provided
        if search:
            search_filter = or_(
                Project.name.ilike(f"%{search}%"),
                Project.description.ilike(f"%{search}%")
            )
            owned_query = owned_query.filter(search_filter)
            member_query = member_query.filter(search_filter)
        
        # Get projects
        owned_projects = owned_query.all()
        member_projects = member_query.all()
        
        # Combine and remove duplicates
        all_projects_dict = {p.id: p for p in owned_projects + member_projects}
        return list(all_projects_dict.values())

    def update_project(
        self,
        project_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        usage_mode: Optional[str] = None,
        diagnostic_config: Optional[dict] = None,
    ) -> Optional[Project]:
        """
        Update project (Design 5.1.5: usage_mode upgrade to Full Mode).

        Args:
            project_id: Project ID
            name: Optional new name
            description: Optional new description
            usage_mode: Optional 'full' or 'test_only'

        Returns:
            Updated Project entity or None if not found
        """
        project = self.project_repo.find_by_id(project_id)
        if not project or not project.is_active or project.is_deleted:
            return None

        if name is not None:
            project.name = name
        if description is not None:
            project.description = description
        if usage_mode is not None and usage_mode in ("full", "test_only"):
            project.usage_mode = usage_mode
        if diagnostic_config is not None:
            # Merge existing config or overwrite
            existing = project.diagnostic_config or {}
            if isinstance(existing, str):
                import json
                existing = json.loads(existing)
            existing.update(diagnostic_config)
            project.diagnostic_config = existing

        # Transaction is managed by get_db() dependency
        return self.project_repo.save(project)

    def delete_project(self, project_id: int) -> bool:
        """
        Soft delete project.
        
        Args:
            project_id: Project ID
        
        Returns:
            True if deleted, False if not found
        """
        project = self.project_repo.find_by_id(project_id)
        if not project or project.is_deleted:
            return False
        
        project.is_active = False
        project.is_deleted = True
        project.deleted_at = datetime.now(timezone.utc)
        # Transaction is managed by get_db() dependency
        self.project_repo.save(project)
        return True
