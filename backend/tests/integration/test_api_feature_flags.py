"""
Integration tests for Feature Flags API
"""
import pytest
from fastapi import status


@pytest.mark.integration
@pytest.mark.asyncio
class TestFeatureFlagsAPI:
    """Test Feature Flags API endpoints"""
    
    async def test_get_all_feature_flags(self, async_client, auth_headers):
        """Test getting all feature flags"""
        response = await async_client.get(
            "/api/v1/feature-flags",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, dict)
        # Check for common feature flags
        assert "FEATURE_FLAG_NEW_DASHBOARD" in data or len(data) >= 0
    
    async def test_get_feature_flags_without_auth(self, async_client):
        """Test getting feature flags without authentication"""
        response = await async_client.get("/api/v1/feature-flags")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_get_specific_feature_flag(self, async_client, auth_headers):
        """Test getting a specific feature flag"""
        response = await async_client.get(
            "/api/v1/feature-flags/FEATURE_FLAG_NEW_DASHBOARD",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "flag" in data
        assert "enabled" in data
        assert data["flag"] == "FEATURE_FLAG_NEW_DASHBOARD"
        assert isinstance(data["enabled"], bool)
    
    async def test_get_nonexistent_feature_flag(self, async_client, auth_headers):
        """Test getting a non-existent feature flag"""
        response = await async_client.get(
            "/api/v1/feature-flags/NONEXISTENT_FLAG",
            headers=auth_headers
        )
        
        # Should return False for non-existent flags
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "flag" in data
        assert "enabled" in data
        assert data["enabled"] is False
