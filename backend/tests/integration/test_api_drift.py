"""
Integration tests for Drift API
"""
import pytest
from fastapi import status
from datetime import datetime, timedelta
from app.models.api_call import APICall


@pytest.mark.integration
@pytest.mark.asyncio
class TestDriftAPI:
    """Test Drift API endpoints using async client"""
    
    async def test_detect_drift(self, async_client, auth_headers, test_project, db):
        """Test detecting drift"""
        baseline_date = datetime.utcnow() - timedelta(days=5)
        
        for i in range(10):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={},
                response_data={},
                response_text="A" * 100,
                created_at=baseline_date + timedelta(hours=i)
            )
            db.add(api_call)
        
        for i in range(10):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={},
                response_data={},
                response_text="B" * 200,
                created_at=datetime.utcnow() - timedelta(hours=i)
            )
            db.add(api_call)
        
        db.commit()
        
        # detect_drift endpoint expects project_id as path parameter or query param
        # Based on the endpoint signature, it's a path parameter
        response = await async_client.post(
            "/api/v1/drift/detect",
            params={"project_id": test_project.id},
            json={},  # DetectDriftRequest body (optional fields)
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
    
    async def test_list_drift_detections(self, async_client, auth_headers, test_project):
        """Test listing drift detections"""
        response = await async_client.get(
            "/api/v1/drift",
            params={"project_id": test_project.id},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
