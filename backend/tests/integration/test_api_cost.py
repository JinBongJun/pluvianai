"""
Integration tests for Cost API
"""
import pytest
from fastapi import status
from datetime import datetime, timedelta
from app.models.api_call import APICall


@pytest.mark.integration
class TestCostAPI:
    """Test Cost API endpoints"""
    
    def test_get_cost_analysis(self, client, auth_headers, test_project, db):
        """Test getting cost analysis"""
        for i in range(5):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_tokens=1000,
                response_tokens=500,
                created_at=datetime.utcnow() - timedelta(days=i)
            )
            db.add(api_call)
        
        db.commit()
        
        response = client.get(
            "/api/v1/cost/analysis",
            params={"project_id": test_project.id, "days": 7},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "total_cost" in data
        assert "by_model" in data
        assert "by_provider" in data
