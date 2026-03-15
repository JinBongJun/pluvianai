"""
Integration tests for Quality API
"""
import pytest
from fastapi import status
from app.models.quality_score import QualityScore


@pytest.mark.integration
@pytest.mark.asyncio
class TestQualityAPI:
    """Test Quality API endpoints using async client"""
    
    async def test_list_quality_scores(self, async_client, auth_headers, test_project, db):
        """Test listing quality scores"""
        score = QualityScore(
            project_id=test_project.id,
            score=88.5,
            metric_name="rule_based",
        )
        db.add(score)
        db.commit()
        db.refresh(score)
        
        response = await async_client.get(
            f"/api/v1/projects/{test_project.id}/quality/scores",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
    
    async def test_get_quality_stats(self, async_client, auth_headers, test_project, db):
        """Test getting quality statistics"""
        response = await async_client.get(
            f"/api/v1/projects/{test_project.id}/quality/stats",
            params={"days": 7},
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "average_score" in data
        assert "total_evaluations" in data
