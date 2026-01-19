"""
Unit tests for AgentChainProfiler
"""
import pytest
from datetime import datetime, timedelta
from app.services.agent_chain_profiler import AgentChainProfiler
from app.models.api_call import APICall
from app.models.quality_score import QualityScore


@pytest.mark.unit
class TestAgentChainProfiler:
    """Test AgentChainProfiler service"""
    
    def test_profile_chain_without_db(self):
        """Test profiling chain without database session"""
        profiler = AgentChainProfiler()
        
        with pytest.raises(ValueError, match="Database session required"):
            profiler.profile_chain(project_id=1, db=None)
    
    def test_profile_chain_empty(self, db, test_project):
        """Test profiling chain with no data"""
        profiler = AgentChainProfiler()
        
        result = profiler.profile_chain(
            project_id=test_project.id,
            db=db
        )
        
        assert isinstance(result, dict)
        assert "chain_id" in result
        assert "total_calls" in result
        assert "success_rate" in result
        assert "avg_latency" in result
        assert result["total_calls"] == 0
    
    def test_profile_chain_with_data(self, db, test_project):
        """Test profiling chain with actual data"""
        profiler = AgentChainProfiler()
        chain_id = "test-chain-123"
        
        # Create API calls with chain_id
        for i in range(5):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                chain_id=chain_id,
                agent_name=f"agent-{i}",
                request_data={"messages": [{"role": "user", "content": "test"}]},
                response_data={"choices": [{"message": {"content": "response"}}]},
                response_text="response",
                status_code=200,
                latency_ms=100.0 + i * 10,
                created_at=datetime.utcnow() - timedelta(days=1)
            )
            db.add(api_call)
        
        db.commit()
        
        result = profiler.profile_chain(
            project_id=test_project.id,
            chain_id=chain_id,
            db=db
        )
        
        assert isinstance(result, dict)
        assert result["total_calls"] == 5
        assert result["success_rate"] == 1.0  # All successful
        assert "avg_latency" in result
        assert "agents" in result
        assert len(result["agents"]) == 5
    
    def test_profile_chain_with_quality_scores(self, db, test_project):
        """Test profiling chain with quality scores"""
        profiler = AgentChainProfiler()
        chain_id = "test-chain-quality"
        
        # Create API call
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            chain_id=chain_id,
            agent_name="agent-1",
            request_data={"messages": [{"role": "user", "content": "test"}]},
            response_data={"choices": [{"message": {"content": "response"}}]},
            response_text="response",
            status_code=200,
            latency_ms=100.0,
            created_at=datetime.utcnow() - timedelta(days=1)
        )
        db.add(api_call)
        db.flush()
        
        # Create quality score
        quality_score = QualityScore(
            project_id=test_project.id,
            api_call_id=api_call.id,
            overall_score=85.0,
            json_valid=True,
            semantic_consistency_score=80.0,
            tone_score=90.0,
            coherence_score=85.0
        )
        db.add(quality_score)
        db.commit()
        
        result = profiler.profile_chain(
            project_id=test_project.id,
            chain_id=chain_id,
            db=db
        )
        
        assert isinstance(result, dict)
        assert result["total_calls"] == 1
        assert "agents" in result
        if result["agents"]:
            agent = result["agents"][0]
            assert "avg_quality_score" in agent
            assert agent["avg_quality_score"] == 85.0
