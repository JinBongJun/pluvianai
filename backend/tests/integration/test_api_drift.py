"""
Integration tests for Drift API
"""
import pytest
from fastapi import status
from datetime import datetime, timedelta
from app.models.api_call import APICall


@pytest.mark.integration
class TestDriftAPI:
    """Test Drift API endpoints"""
    
    def test_detect_drift(self, client, auth_headers, test_project, db):
        """Test detecting drift"""
        baseline_date = datetime.utcnow() - timedelta(days=5)
        
        for i in range(10):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="A" * 100,
                created_at=baseline_date + timedelta(hours=i)
            )
            db.add(api_call)
        
        for i in range(10):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="B" * 200,
                created_at=datetime.utcnow() - timedelta(hours=i)
            )
            db.add(api_call)
        
        db.commit()
        
        response = client.post(
            f"/api/v1/drift/detect",
            json={"project_id": test_project.id},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_drift_detections(self, client, auth_headers, test_project):
        """Test listing drift detections"""
        response = client.get(
            "/api/v1/drift",
            params={"project_id": test_project.id},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
