from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.subscription_limits import normalize_plan_type
from app.models.api_key import APIKey
from app.models.organization import Organization, OrganizationMember
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.refresh_token import RefreshToken
from app.models.subscription import Subscription
from app.models.user import User
from app.models.user_api_key import UserApiKey


@dataclass
class AccountDeletionBlocked(Exception):
    code: str
    message: str
    status_code: int


class AccountDeletionService:
    def __init__(self, db: Session):
        self.db = db

    def _utcnow(self) -> datetime:
        return datetime.now(timezone.utc)

    def _has_blocking_subscription(self, user: User) -> bool:
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user.id).first()
        if not subscription:
            return False

        plan_type = normalize_plan_type(subscription.plan_type or "free")
        status = str(subscription.status or "active").strip().lower()
        if status == "canceled":
            status = "cancelled"

        if plan_type == "free":
            return False

        if status in {"free"}:
            return False

        period_end = subscription.current_period_end
        if period_end is not None and period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=timezone.utc)

        if status == "cancelled" and period_end is not None and period_end <= self._utcnow():
            return False

        return True

    def _owned_organizations(self, user_id: int) -> list[Organization]:
        return (
            self.db.query(Organization)
            .filter(
                Organization.owner_id == user_id,
                Organization.is_deleted.is_(False),
            )
            .all()
        )

    def _organization_has_other_members(self, org_id: int, user_id: int) -> bool:
        other_member = (
            self.db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id != user_id,
            )
            .first()
        )
        return other_member is not None

    def _ensure_deletion_allowed(self, user: User) -> None:
        if self._has_blocking_subscription(user):
            raise AccountDeletionBlocked(
                code="ACTIVE_SUBSCRIPTION",
                message="Cancel your active subscription in Billing before deleting your account.",
                status_code=409,
            )

        for org in self._owned_organizations(user.id):
            if self._organization_has_other_members(int(org.id), user.id):
                raise AccountDeletionBlocked(
                    code="LAST_OWNER_OF_SHARED_ORG",
                    message="Transfer ownership of your shared organization before deleting your account.",
                    status_code=409,
                )

    def delete_account(self, user: User) -> dict:
        self._ensure_deletion_allowed(user)

        now = self._utcnow()
        owned_orgs = self._owned_organizations(user.id)
        owned_org_ids = {int(org.id) for org in owned_orgs}

        # Soft-delete personal organizations and all their projects.
        for org in owned_orgs:
            org.is_deleted = True
            org.deleted_at = now

        if owned_org_ids:
            (
                self.db.query(Project)
                .filter(Project.organization_id.in_(owned_org_ids))
                .update(
                    {
                        Project.is_active: False,
                        Project.is_deleted: True,
                        Project.deleted_at: now,
                    },
                    synchronize_session=False,
                )
            )

        # Soft-delete non-org projects that belong only to this user.
        (
            self.db.query(Project)
            .filter(
                Project.owner_id == user.id,
                Project.organization_id.is_(None),
                Project.is_deleted.is_(False),
            )
            .update(
                {
                    Project.is_active: False,
                    Project.is_deleted: True,
                    Project.deleted_at: now,
                },
                synchronize_session=False,
            )
        )

        # For shared org projects created by this user, reassign to the org owner.
        shared_projects = (
            self.db.query(Project, Organization)
            .join(Organization, Organization.id == Project.organization_id)
            .filter(
                Project.owner_id == user.id,
                Project.organization_id.isnot(None),
                Organization.is_deleted.is_(False),
                Organization.owner_id != user.id,
            )
            .all()
        )
        for project, org in shared_projects:
            project.owner_id = org.owner_id

        # Remove memberships in shared organizations/projects.
        (
            self.db.query(OrganizationMember)
            .filter(
                OrganizationMember.user_id == user.id,
                ~OrganizationMember.organization_id.in_(owned_org_ids if owned_org_ids else {-1}),
            )
            .delete(synchronize_session=False)
        )
        (
            self.db.query(ProjectMember)
            .filter(ProjectMember.user_id == user.id)
            .delete(synchronize_session=False)
        )

        # Revoke credentials.
        (
            self.db.query(APIKey)
            .filter(APIKey.user_id == user.id, APIKey.is_active.is_(True))
            .update({APIKey.is_active: False}, synchronize_session=False)
        )
        (
            self.db.query(UserApiKey)
            .filter(UserApiKey.user_id == user.id, UserApiKey.is_active.is_(True))
            .update({UserApiKey.is_active: False}, synchronize_session=False)
        )
        (
            self.db.query(RefreshToken)
            .filter(RefreshToken.user_id == user.id, RefreshToken.is_revoked.is_(False))
            .update(
                {
                    RefreshToken.is_revoked: True,
                    RefreshToken.revoked_at: now,
                },
                synchronize_session=False,
            )
        )

        user.is_active = False

        self.db.flush()

        return {
            "owned_organization_ids": sorted(owned_org_ids),
            "owned_project_soft_deleted": len(owned_org_ids),
            "shared_projects_reassigned": len(shared_projects),
        }
