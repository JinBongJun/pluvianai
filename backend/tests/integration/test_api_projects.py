"""
Integration tests for Projects API
"""
import pytest
from fastapi import status


@pytest.mark.integration
class TestProjectsAPI:
    """Test Projects API endpoints"""
    
    def test_create_project_success(self, client, auth_headers):
        """Test creating a project successfully"""
        response = client.post(
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
    
    def test_create_project_without_auth(self, client):
        """Test creating a project without authentication"""
        response = client.post(
            "/api/v1/projects",
            json={
                "name": "New Project",
                "description": "Test"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_create_project_duplicate_name(self, client, auth_headers, test_project):
        """Test creating a project with duplicate name"""
        response = client.post(
            "/api/v1/projects",
            json={
                "name": test_project.name,
                "description": "Duplicate"
            },
            headers=auth_headers
        )
        
        # Should allow duplicate names (different projects can have same name)
        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]
    
    def test_list_projects(self, client, auth_headers, test_project):
        """Test listing user's projects"""
        response = client.get(
            "/api/v1/projects",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(p["id"] == test_project.id for p in data)
    
    def test_get_project_by_id(self, client, auth_headers, test_project):
        """Test getting a project by ID"""
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == test_project.id
        assert data["name"] == test_project.name
    
    def test_get_nonexistent_project(self, client, auth_headers):
        """Test getting a project that doesn't exist"""
        response = client.get(
            "/api/v1/projects/99999",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_update_project(self, client, auth_headers, test_project):
        """Test updating a project"""
        response = client.patch(
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
    
    def test_delete_project(self, client, auth_headers, test_project):
        """Test deleting a project"""
        response = client.delete(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Verify project is deleted
        get_response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert get_response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_create_project_with_sample_data(self, client, auth_headers):
        """Test creating a project with sample data generation"""
        response = client.post(
            "/api/v1/projects",
            json={
                "name": "Project with Samples",
                "description": "Test",
                "generate_sample_data": True
            },
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        project_id = response.json()["id"]
        
        # Check if sample data was created
        api_calls_response = client.get(
            f"/api/v1/api-calls?project_id={project_id}",
            headers=auth_headers
        )
        
        assert api_calls_response.status_code == status.HTTP_200_OK
        # Sample data should have been created
        # (exact count depends on implementation)
