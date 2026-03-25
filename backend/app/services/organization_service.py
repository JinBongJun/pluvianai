from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.organization import Organization, OrganizationMember
from app.infrastructure.repositories.organization_repository import OrganizationRepository
from app.infrastructure.repositories.organization_member_repository import OrganizationMemberRepository
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError
from app.core.logging_config import logger


class OrganizationService:
    """Service for organization management business logic"""

    def __init__(
        self,
        org_repo: OrganizationRepository,
        member_repo: OrganizationMemberRepository,
        db: Session
    ):
        self.org_repo = org_repo
        self.member_repo = member_repo
        self.db = db

    def create_organization(
        self,
        name: str,
        owner_id: int,
        description: Optional[str] = None,
        plan_type: str = "free"
    ) -> Organization:
        """
        Create a new organization with owner as member.

        Args:
            name: Organization name
            owner_id: Owner user ID
            description: Optional description
            plan_type: Plan type (default: "free")
        """
        existing = (
            self.db.query(Organization)
            .filter(
                Organization.owner_id == owner_id,
                Organization.name == name,
                Organization.is_deleted.is_(False),
            )
            .first()
        )
        if existing:
            raise EntityAlreadyExistsError("An organization with this name already exists")

        org = Organization(
            name=name.strip(),
            description=description.strip() if description else None,
            plan_type=plan_type,
            owner_id=owner_id
        )
        org = self.org_repo.save(org)
        
        # Create owner membership
        member = OrganizationMember(
            organization_id=org.id,
            user_id=owner_id,
            role="owner"
        )
        self.member_repo.save(member)
        
        # Transaction is managed by get_db() dependency
        return org

    def get_organization_by_id(self, org_id: int) -> Optional[Organization]:
        """Get organization by ID"""
        org = self.org_repo.find_by_id(org_id)
        if org and org.is_deleted:
            return None
        return org

    def get_organizations_by_owner_id(self, owner_id: int) -> List[Organization]:
        """Get all organizations owned by user"""
        return self.org_repo.find_by_owner_id(owner_id)

    def get_organizations_by_user_id(self, user_id: int) -> List[Organization]:
        """Get all organizations where user is owner or member"""
        # Get owned organizations
        owned = self.org_repo.find_by_owner_id(user_id)
        
        # Get organizations where user is member
        memberships = self.member_repo.find_by_user_id(user_id)
        member_org_ids = [m.organization_id for m in memberships]
        member_orgs = []
        if member_org_ids:
            for org_id in member_org_ids:
                org = self.org_repo.find_by_id(org_id)
                if org is not None and not org.is_deleted:
                    member_orgs.append(org)
        
        # Combine and remove duplicates
        all_orgs_dict = {o.id: o for o in owned + member_orgs}
        return list(all_orgs_dict.values())

    def add_member(
        self,
        organization_id: int,
        user_id: int,
        role: str = "member"
    ) -> OrganizationMember:
        """
        Add a member to organization
        
        Args:
            organization_id: Organization ID
            user_id: User ID to add
            role: Member role (default: "member")
        
        Returns:
            Created OrganizationMember entity
        
        Raises:
            EntityAlreadyExistsError: If user is already a member
        """
        # Check if already a member
        existing = self.member_repo.find_by_organization_and_user(organization_id, user_id)
        if existing:
            raise EntityAlreadyExistsError("User is already a member of this organization")

        member = OrganizationMember(
            organization_id=organization_id,
            user_id=user_id,
            role=role
        )
        return self.member_repo.save(member)

    def remove_member(self, organization_id: int, user_id: int) -> bool:
        """
        Remove a member from organization
        
        Args:
            organization_id: Organization ID
            user_id: User ID to remove
        
        Returns:
            True if removed, False if not found
        """
        member = self.member_repo.find_by_organization_and_user(organization_id, user_id)
        if not member:
            return False
        
        self.db.delete(member)
        # Transaction is managed by get_db() dependency
        return True

    def update_member_role(
        self,
        organization_id: int,
        user_id: int,
        new_role: str
    ) -> Optional[OrganizationMember]:
        """
        Update member role
        
        Args:
            organization_id: Organization ID
            user_id: User ID
            new_role: New role
        
        Returns:
            Updated OrganizationMember or None if not found
        """
        member = self.member_repo.find_by_organization_and_user(organization_id, user_id)
        if not member:
            return None
        
        member.role = new_role
        return self.member_repo.save(member)

    def update_organization(
        self,
        org_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> Optional[Organization]:
        """
        Update organization details.
        """
        org = self.org_repo.find_by_id(org_id)
        if not org or org.is_deleted:
            return None
        
        if name is not None:
            org.name = name.strip()
        if description is not None:
            org.description = description.strip()
        
        return self.org_repo.save(org)

    def delete_organization(self, org_id: int) -> bool:
        """
        Soft-delete organization and related projects.
        """
        org = self.org_repo.find_by_id(org_id)
        if not org or org.is_deleted:
            return False

        now = datetime.now(timezone.utc)
        org.is_deleted = True
        org.deleted_at = now

        # Hide organization projects immediately from users.
        for project in org.projects:
            project.is_active = False
            project.is_deleted = True
            project.deleted_at = now

        self.org_repo.save(org)
        return True
