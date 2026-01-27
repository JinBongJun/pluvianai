"""
Integration tests for Onboarding API
"""
import pytest
from fastapi import status


@pytest.mark.integration
@pytest.mark.asyncio
class TestOnboardingAPI:
    """Test Onboarding API endpoints"""

    async def test_get_quick_start_success(self, async_client, auth_headers, test_project):
        """Test getting Quick Start guide successfully"""
        response = await async_client.get(
            "/api/v1/onboarding/quick-start",
            params={"project_id": test_project.id},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Handle standard response format {data: {...}, meta: {...}}
        if "data" in data:
            data = data["data"]
        
        assert "curl_command" in data
        assert "python_code" in data
        assert "node_code" in data
        assert "api_key" in data
        assert data["project_id"] == test_project.id

    async def test_get_quick_start_with_project_id(self, async_client, auth_headers, test_project):
        """Test getting Quick Start guide with project ID parameter"""
        response = await async_client.get(
            "/api/v1/onboarding/quick-start",
            params={"project_id": test_project.id},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        if "data" in data:
            data = data["data"]
        
        assert data["project_id"] == test_project.id
        assert str(test_project.id) in data["curl_command"] or "YOUR_PROJECT_ID" in data["curl_command"]

    async def test_get_quick_start_unauthorized(self, async_client):
        """Test getting Quick Start guide without authentication"""
        response = await async_client.get(
            "/api/v1/onboarding/quick-start"
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_get_quick_start_no_project_id(self, async_client, auth_headers):
        """Test getting Quick Start guide without project ID"""
        response = await async_client.get(
            "/api/v1/onboarding/quick-start",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        if "data" in data:
            data = data["data"]
        
        # Should still return guide, possibly without project_id
        assert "curl_command" in data
        assert "api_key" in data

    async def test_simulate_traffic_success(self, async_client, auth_headers, test_project):
        """Test simulating virtual traffic successfully"""
        response = await async_client.post(
            "/api/v1/onboarding/simulate",
            json={"project_id": test_project.id},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        if "data" in data:
            data = data["data"]
        
        assert "snapshots_created" in data
        assert data["snapshots_created"] == 3
        assert "snapshots" in data
        assert len(data["snapshots"]) == 3
        assert "message" in data

    async def test_simulate_traffic_invalid_project(self, async_client, auth_headers):
        """Test simulating traffic with invalid project ID"""
        response = await async_client.post(
            "/api/v1/onboarding/simulate",
            json={"project_id": 99999},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        error_msg = data.get("error", {}).get("message") or data.get("detail", "")
        assert "not found" in error_msg.lower() or "access denied" in error_msg.lower()

    async def test_simulate_traffic_unauthorized(self, async_client, test_project):
        """Test simulating traffic without authentication"""
        response = await async_client.post(
            "/api/v1/onboarding/simulate",
            json={"project_id": test_project.id}
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_get_onboarding_status_success(self, async_client, auth_headers, test_project):
        """Test getting onboarding status successfully"""
        response = await async_client.get(
            "/api/v1/onboarding/status",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        if "data" in data:
            data = data["data"]
        
        assert "completed" in data
        assert "has_project" in data
        assert "has_snapshot" in data
        assert "has_agreement" in data
        assert "project_count" in data
        assert "snapshot_count" in data
        assert isinstance(data["completed"], bool)
        assert isinstance(data["has_project"], bool)

    async def test_get_onboarding_status_unauthorized(self, async_client):
        """Test getting onboarding status without authentication"""
        response = await async_client.get(
            "/api/v1/onboarding/status"
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_check_first_snapshot_success(self, async_client, auth_headers, test_project):
        """Test checking first snapshot celebration"""
        # First, simulate traffic to create a snapshot
        simulate_response = await async_client.post(
            "/api/v1/onboarding/simulate",
            json={"project_id": test_project.id},
            headers=auth_headers
        )
        
        if simulate_response.status_code == status.HTTP_200_OK:
            # Check first snapshot
            response = await async_client.get(
                "/api/v1/onboarding/first-snapshot-celebration",
                params={"project_id": test_project.id},
                headers=auth_headers
            )
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            if "data" in data:
                data = data["data"]
            
            assert "is_first_snapshot" in data
            assert isinstance(data["is_first_snapshot"], bool)
            
            if data["is_first_snapshot"]:
                assert "message" in data
                assert "next_steps" in data

    async def test_check_first_snapshot_unauthorized(self, async_client, test_project):
        """Test checking first snapshot without authentication"""
        response = await async_client.get(
            "/api/v1/onboarding/first-snapshot-celebration",
            params={"project_id": test_project.id}
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_check_first_snapshot_invalid_project(self, async_client, auth_headers):
        """Test checking first snapshot with invalid project"""
        response = await async_client.get(
            "/api/v1/onboarding/first-snapshot-celebration",
            params={"project_id": 99999},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
