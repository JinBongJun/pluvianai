"""
Integration tests for Monitoring API
"""
import pytest
from fastapi import status


@pytest.mark.integration
@pytest.mark.asyncio
class TestMonitoringAPI:
    """Test Monitoring API endpoints"""
    
    async def test_get_monitoring_status(self, async_client, auth_headers):
        """Test getting monitoring status"""
        response = await async_client.get(
            "/api/v1/monitoring/status",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "metrics_enabled" in data
        assert "environment" in data
        assert "monitoring" in data
        assert "status" in data
        assert data["status"] == "operational"
        assert "metrics_endpoint" in data["monitoring"]
        assert "health_endpoint" in data["monitoring"]
    
    async def test_get_monitoring_status_without_auth(self, async_client):
        """Test getting monitoring status without authentication"""
        response = await async_client.get("/api/v1/monitoring/status")
        
        # Monitoring status might be public or require auth
        # Adjust based on your security requirements
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_401_UNAUTHORIZED]
    
    async def test_get_current_metrics(self, async_client, auth_headers):
        """Test getting current metrics summary"""
        response = await async_client.get(
            "/api/v1/monitoring/metrics",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "total_requests" in data
        assert "error_rate" in data
        assert "avg_latency" in data
        assert "active_users" in data
        assert "active_projects" in data
        assert "timestamp" in data
        assert isinstance(data["total_requests"], int)
        assert isinstance(data["error_rate"], float)
        assert isinstance(data["avg_latency"], int)
        assert isinstance(data["active_users"], int)
        assert isinstance(data["active_projects"], int)
