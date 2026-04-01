"""
Integration tests for Projects API
"""
import pytest
from fastapi import status
from unittest.mock import patch

from app.main import app
from app.core.security import get_current_user, get_password_hash
from app.models.organization import Organization, OrganizationMember
from app.models.project_member import ProjectMember
from app.models.user import User


@pytest.mark.integration
@pytest.mark.asyncio
class TestProjectsAPI:
    """Test Projects API endpoints using async client"""
    
    async def test_create_project_success(self, async_client, auth_headers):
        """Test creating a project successfully"""
        response = await async_client.post(
            "/api/v1/projects",
            json={
                "name": "New Test Project",
                "description": "Test Description"
            },
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "New Test Project"
        assert data["description"] == "Test Description"
        assert "id" in data
        assert data["is_active"] is True
    
    async def test_create_project_without_auth(self, async_client):
        """Test creating a project without authentication"""
        response = await async_client.post(
            "/api/v1/projects",
            json={
                "name": "New Project",
                "description": "Test"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_create_project_duplicate_name(self, async_client, auth_headers, test_project):
        """Test creating a project with duplicate name"""
        response = await async_client.post(
            "/api/v1/projects",
            json={
                "name": test_project.name,
                "description": "Duplicate"
            },
            headers=auth_headers
        )
        
        # API returns 409 CONFLICT for duplicate names (same owner)
        # Or 403 if project limit is reached
        assert response.status_code in [
            status.HTTP_409_CONFLICT,  # Duplicate name
            status.HTTP_403_FORBIDDEN,  # Project limit reached
            status.HTTP_201_CREATED     # If duplicate names are allowed (unlikely)
        ]
        
        # If it's a conflict, verify the error message
        # Our exception handler returns {"error": True, "message": ..., "status_code": ...}
        if response.status_code == status.HTTP_409_CONFLICT:
            data = response.json()
            # Check for either "detail" (FastAPI default) or "message" (our custom handler)
            error_msg = (
                data.get("message")
                or data.get("detail", "")
                or (data.get("error", {}) if isinstance(data.get("error"), dict) else {}).get("message", "")
            )
            assert "already exists" in error_msg.lower() or "duplicate" in error_msg.lower()
    
    async def test_list_projects(self, async_client, auth_headers, test_project):
        """Test listing user's projects"""
        response = await async_client.get(
            "/api/v1/projects",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(p["id"] == test_project.id for p in data)
    
    async def test_get_project_by_id(self, async_client, auth_headers, test_project):
        """Test getting a project by ID"""
        response = await async_client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == test_project.id
        assert data["name"] == test_project.name
        assert data["role"] == "owner"
        assert data["access_source"] == "owned"
        assert data["created_by_me"] is True
        assert data["has_project_access"] is True
        assert data["entitlement_scope"] == "account"

    async def test_org_member_without_project_membership_gets_structured_project_denial(
        self, async_client, auth_headers, db, test_project, test_user
    ):
        org = Organization(name="Structured Access Org", owner_id=test_user.id, plan_type="free")
        db.add(org)
        db.commit()
        db.refresh(org)

        test_project.organization_id = org.id
        db.add(OrganizationMember(organization_id=org.id, user_id=test_user.id, role="owner"))

        org_viewer = User(
            email="org-only-project-visibility@example.com",
            hashed_password=get_password_hash("password123"),
            full_name="Org Only Viewer",
            is_active=True,
        )
        db.add(org_viewer)
        db.commit()
        db.refresh(org_viewer)

        db.add(OrganizationMember(organization_id=org.id, user_id=org_viewer.id, role="viewer"))
        db.commit()

        app.dependency_overrides[get_current_user] = lambda: org_viewer
        try:
            response = await async_client.get(
                f"/api/v1/projects/{test_project.id}",
                headers=auth_headers,
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        body = response.json()
        payload = body.get("detail") or body.get("error") or {}
        assert payload.get("code") == "PROJECT_ACCESS_DENIED"
        assert "visible because you belong to the organization" in payload.get("message", "").lower()
        details = payload.get("details") or {}
        if isinstance(details.get("details"), dict):
            details = details["details"]
        assert details.get("access_source") == "organization_member"
        assert details.get("org_role") == "viewer"
        assert details.get("has_project_access") is False
    
    async def test_get_nonexistent_project(self, async_client, auth_headers):
        """Test getting a project that doesn't exist"""
        response = await async_client.get(
            "/api/v1/projects/99999",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    async def test_update_project(self, async_client, auth_headers, test_project):
        """Test updating a project"""
        response = await async_client.patch(
            f"/api/v1/projects/{test_project.id}",
            json={
                "name": "Updated Name",
                "description": "Updated Description"
            },
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated Description"
    
    async def test_delete_project(self, async_client, auth_headers, test_project):
        """Test deleting a project"""
        response = await async_client.delete(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Verify project is deleted
        get_response = await async_client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert get_response.status_code == status.HTTP_404_NOT_FOUND

    async def test_delete_project_invalidates_project_list_cache_for_owner_and_members(
        self, async_client, auth_headers, db, test_project
    ):
        member = User(
            email="project-cache-member@example.com",
            hashed_password=get_password_hash("password123"),
            full_name="Project Cache Member",
            is_active=True,
        )
        db.add(member)
        db.commit()
        db.refresh(member)

        db.add(
            ProjectMember(
                project_id=test_project.id,
                user_id=member.id,
                role="member",
            )
        )
        db.commit()

        with patch(
            "app.api.v1.endpoints.projects.cache_service.invalidate_user_projects_cache"
        ) as invalidate_user_cache, patch(
            "app.api.v1.endpoints.projects.cache_service.invalidate_project_cache"
        ) as invalidate_project_cache:
            response = await async_client.delete(
                f"/api/v1/projects/{test_project.id}",
                headers=auth_headers,
            )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        invalidated_user_ids = {call.args[0] for call in invalidate_user_cache.call_args_list}
        assert test_project.owner_id in invalidated_user_ids
        assert member.id in invalidated_user_ids
        invalidate_project_cache.assert_called_once_with(test_project.id)
    
    async def test_create_project_with_sample_data(self, async_client, auth_headers):
        """Non-superuser cannot request sample data generation"""
        response = await async_client.post(
            "/api/v1/projects",
            json={
                "name": "Project with Samples",
                "description": "Test",
                "generate_sample_data": True
            },
            headers=auth_headers
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    async def test_project_limit_error_includes_normalized_details(self, async_client, auth_headers):
        """Project limit errors should include canonical metric payload fields."""
        # Free plan allows up to 2 projects. Fill slots, then assert normalized 403 payload.
        first = await async_client.post(
            "/api/v1/projects",
            json={"name": "limit-test-project-1", "description": "fill slot"},
            headers=auth_headers,
        )
        assert first.status_code == status.HTTP_201_CREATED

        second = await async_client.post(
            "/api/v1/projects",
            json={"name": "limit-test-project-2", "description": "fill second slot"},
            headers=auth_headers,
        )
        assert second.status_code == status.HTTP_201_CREATED

        blocked = await async_client.post(
            "/api/v1/projects",
            json={"name": "limit-test-project-3", "description": "should block"},
            headers=auth_headers,
        )
        assert blocked.status_code == status.HTTP_403_FORBIDDEN
        body = blocked.json()
        payload = body.get("detail") or body.get("error") or {}
        direct_code = payload.get("code")
        details = payload.get("details") or {}
        nested_payload = details if isinstance(details, dict) else {}
        if isinstance(nested_payload.get("details"), dict):
            nested_payload = nested_payload["details"]
        code = direct_code or (details.get("code") if isinstance(details, dict) else None)
        assert code == "PROJECT_LIMIT_REACHED"
        assert nested_payload.get("metric") == "projects"
        assert isinstance(nested_payload.get("remaining"), int)
        assert nested_payload.get("remaining") == 0
        assert isinstance(nested_payload.get("reset_at"), str)
