"""
Integration tests for Alerts API
"""
import pytest
from fastapi import status
from app.models.alert import Alert


@pytest.mark.integration
class TestAlertsAPI:
    """Test Alerts API endpoints"""
    
    def test_list_alerts(self, client, auth_headers, test_project, db):
        """Test listing alerts"""
        alert = Alert(
            project_id=test_project.id,
            alert_type="drift",
            severity="high",
            title="Test Alert",
            message="Test message"
        )
        db.add(alert)
        db.commit()
        
        response = client.get(
            "/api/v1/alerts",
            params={"project_id": test_project.id},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_alert_by_id(self, client, auth_headers, test_project, db):
        """Test getting alert by ID"""
        alert = Alert(
            project_id=test_project.id,
            alert_type="drift",
            severity="high",
            title="Test Alert",
            message="Test message"
        )
        db.add(alert)
        db.commit()
        
        response = client.get(
            f"/api/v1/alerts/{alert.id}",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == alert.id
        assert data["alert_type"] == "drift"
