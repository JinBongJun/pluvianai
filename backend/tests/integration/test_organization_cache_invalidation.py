from unittest.mock import patch

import pytest
from fastapi import status

from app.core.security import get_password_hash
from app.models.organization import Organization, OrganizationMember
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User


@pytest.mark.integration
@pytest.mark.asyncio
class TestOrganizationCacheInvalidation:
    async def test_delete_organization_invalidates_project_list_cache_for_members(
        self, async_client, auth_headers, db, test_user
    ):
        org = Organization(name="Cache Org", owner_id=test_user.id)
        db.add(org)
        db.commit()
        db.refresh(org)

        project = Project(
            name="Cache Project",
            owner_id=test_user.id,
            organization_id=org.id,
            is_active=True,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        org_member = User(
            email="org-cache-member-async@example.com",
            hashed_password=get_password_hash("password123"),
            full_name="Org Cache Member",
            is_active=True,
        )
        project_member = User(
            email="project-cache-member-async@example.com",
            hashed_password=get_password_hash("password123"),
            full_name="Project Cache Member",
            is_active=True,
        )
        db.add_all([org_member, project_member])
        db.commit()
        db.refresh(org_member)
        db.refresh(project_member)

        db.add_all(
            [
                OrganizationMember(organization_id=org.id, user_id=org_member.id, role="member"),
                ProjectMember(project_id=project.id, user_id=project_member.id, role="member"),
            ]
        )
        db.commit()

        with patch(
            "app.api.v1.endpoints.organizations.cache_service.invalidate_user_projects_cache"
        ) as invalidate_user_cache, patch(
            "app.api.v1.endpoints.organizations.cache_service.invalidate_project_cache"
        ) as invalidate_project_cache:
            response = await async_client.delete(
                f"/api/v1/organizations/{org.id}",
                headers=auth_headers,
            )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        invalidated_user_ids = {call.args[0] for call in invalidate_user_cache.call_args_list}
        assert test_user.id in invalidated_user_ids
        assert org_member.id in invalidated_user_ids
        assert project_member.id in invalidated_user_ids
        invalidate_project_cache.assert_called_once_with(project.id)
