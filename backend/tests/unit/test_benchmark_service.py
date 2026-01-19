"""
Unit tests for BenchmarkService
"""
import pytest
from datetime import datetime, timedelta
from app.services.benchmark_service import BenchmarkService
from app.models.api_call import APICall
from app.models.quality_score import QualityScore


@pytest.mark.unit
class TestBenchmarkService:
    """Test BenchmarkService"""
    
    def test_compare_models_without_db(self):
        """Test comparing models without database session"""
        service = BenchmarkService()
        
        with pytest.raises(ValueError, match="Database session required"):
            service.compare_models(project_id=1, db=None)
    
    def test_compare_models_empty(self, db, test_project):
        """Test comparing models with no data"""
        service = BenchmarkService()
        
        result = service.compare_models(
            project_id=test_project.id,
            db=db
        )
        
        assert isinstance(result, list)
        assert len(result) == 0
    
    def test_compare_models_with_data(self, db, test_project):
        """Test comparing models with actual data"""
        service = BenchmarkService()
        
        # Create API calls for different models
        models = [
            ("openai", "gpt-4"),
            ("openai", "gpt-3.5-turbo"),
            ("anthropic", "claude-3-opus"),
        ]
        
        for provider, model in models:
            for i in range(3):
                api_call = APICall(
                    project_id=test_project.id,
                    provider=provider,
                    model=model,
                    request_data={"messages": [{"role": "user", "content": "test"}]},
                    response_data={"choices": [{"message": {"content": "response"}}]},
                    response_text="response",
                    status_code=200,
                    request_tokens=100,
                    response_tokens=200,
                    latency_ms=100.0 + i * 10,
                    created_at=datetime.utcnow() - timedelta(days=1)
                )
                db.add(api_call)
        
        db.commit()
        
        result = service.compare_models(
            project_id=test_project.id,
            db=db
        )
        
        assert isinstance(result, list)
        assert len(result) == 3  # 3 different models
        
        # Check structure
        for model_comparison in result:
            assert "model" in model_comparison
            assert "provider" in model_comparison
            assert "total_calls" in model_comparison
            assert "avg_quality_score" in model_comparison
            assert "total_cost" in model_comparison
            assert "cost_per_call" in model_comparison
            assert "avg_latency" in model_comparison
            assert "success_rate" in model_comparison
            assert model_comparison["total_calls"] == 3
