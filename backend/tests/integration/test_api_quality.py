"""
Integration tests for Quality API
"""
import pytest
from fastapi import status
from datetime import datetime, timedelta
from app.models.api_call import APICall


@pytest.mark.integration
class TestQualityAPI:
    """Test Quality API endpoints"""
    
    def test_list_quality_scores(self, client, auth_headers, test_project, db):
        """Test listing quality scores"""
        from app.models.api_call import APICall
        from app.models.quality_score import QualityScore
        from app.services.quality_evaluator import QualityEvaluator
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={"messages": [{"role": "user", "content": "Test"}]},
            response_data={"choices": [{"message": {"content": "Response"}}]},
            response_text="Response",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        evaluator = QualityEvaluator()
        score = evaluator.evaluate(api_call)
        db.add(score)
        db.commit()
        
        response = client.get(
            "/api/v1/quality/scores",
            params={"project_id": test_project.id},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
    
    def test_get_quality_stats(self, client, auth_headers, test_project, db):
        """Test getting quality statistics"""
        response = client.get(
            "/api/v1/quality/stats",
            params={"project_id": test_project.id, "days": 7},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "average_score" in data
        assert "total_evaluations" in data
