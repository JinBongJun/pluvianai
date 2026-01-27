"""
Unit tests for GoldenCaseService
"""
import pytest
from unittest.mock import Mock, MagicMock
from app.services.golden_case_service import GoldenCaseService
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.models.project import Project


@pytest.mark.unit
class TestGoldenCaseService:
    """Tests for Golden Case Service"""

    @pytest.fixture
    def mock_snapshot_repo(self):
        """Mock SnapshotRepository"""
        return MagicMock()

    @pytest.fixture
    def service(self, db, mock_snapshot_repo):
        """Create GoldenCaseService instance"""
        return GoldenCaseService(mock_snapshot_repo, db)

    def test_extract_golden_cases_success(self, db, test_project, service, mock_snapshot_repo):
        """Test extracting golden cases successfully"""
        # Create mock snapshots
        snapshots = []
        for i in range(10):
            snapshot = Snapshot(
                id=i + 1,
                trace_id=f"trace_{i}",
                provider="openai" if i % 2 == 0 else "anthropic",
                model="gpt-3.5-turbo" if i % 2 == 0 else "claude-3-sonnet",
                payload={
                    "messages": [{"role": "user", "content": f"Test message {i}"}]
                },
                is_sanitized=False,
                status_code=200
            )
            snapshots.append(snapshot)
        
        mock_snapshot_repo.find_by_project_id.return_value = snapshots
        
        result = service.extract_golden_cases(test_project.id, limit=5)
        
        assert len(result) == 5
        assert mock_snapshot_repo.find_by_project_id.called
        assert mock_snapshot_repo.find_by_project_id.call_args[0][0] == test_project.id

    def test_extract_golden_cases_empty(self, db, test_project, service, mock_snapshot_repo):
        """Test extracting golden cases when no snapshots exist"""
        mock_snapshot_repo.find_by_project_id.return_value = []
        
        result = service.extract_golden_cases(test_project.id, limit=100)
        
        assert result == []
        assert mock_snapshot_repo.find_by_project_id.called

    def test_extract_golden_cases_diversity(self, db, test_project, service, mock_snapshot_repo):
        """Test diversity-based selection logic"""
        # Create snapshots with different providers/models
        snapshots = []
        providers = ["openai", "anthropic", "google"]
        models = ["gpt-3.5-turbo", "claude-3-sonnet", "gemini-pro"]
        
        for i in range(20):
            provider = providers[i % 3]
            model = models[i % 3]
            snapshot = Snapshot(
                id=i + 1,
                trace_id=f"trace_{i}",
                provider=provider,
                model=model,
                payload={
                    "messages": [{"role": "user", "content": f"Message {i}"}]
                },
                is_sanitized=False,
                status_code=200
            )
            snapshots.append(snapshot)
        
        mock_snapshot_repo.find_by_project_id.return_value = snapshots
        
        result = service.extract_golden_cases(test_project.id, limit=10)
        
        # Should have diverse selection (different providers/models)
        assert len(result) == 10
        providers_seen = set(s.provider for s in result)
        models_seen = set(s.model for s in result)
        
        # Should have at least some diversity
        assert len(providers_seen) > 1 or len(models_seen) > 1

    def test_extract_golden_cases_fills_remaining(self, db, test_project, service, mock_snapshot_repo):
        """Test that remaining snapshots are used if not enough diverse cases"""
        # Create snapshots with same provider/model (low diversity)
        snapshots = []
        for i in range(5):
            snapshot = Snapshot(
                id=i + 1,
                trace_id=f"trace_{i}",
                provider="openai",
                model="gpt-3.5-turbo",
                payload={
                    "messages": [{"role": "user", "content": f"Message {i}"}]
                },
                is_sanitized=False,
                status_code=200
            )
            snapshots.append(snapshot)
        
        mock_snapshot_repo.find_by_project_id.return_value = snapshots
        
        result = service.extract_golden_cases(test_project.id, limit=10)
        
        # Should return all available snapshots even if not diverse
        assert len(result) == 5

    def test_extract_golden_cases_limit_respected(self, db, test_project, service, mock_snapshot_repo):
        """Test that limit is respected"""
        snapshots = []
        for i in range(200):
            snapshot = Snapshot(
                id=i + 1,
                trace_id=f"trace_{i}",
                provider="openai",
                model="gpt-3.5-turbo",
                payload={
                    "messages": [{"role": "user", "content": f"Message {i}"}]
                },
                is_sanitized=False,
                status_code=200
            )
            snapshots.append(snapshot)
        
        mock_snapshot_repo.find_by_project_id.return_value = snapshots
        
        result = service.extract_golden_cases(test_project.id, limit=50)
        
        assert len(result) == 50

    def test_get_golden_case_summary_success(self, db, test_project, service, mock_snapshot_repo):
        """Test getting golden case summary successfully"""
        # Create mock snapshots with different providers/models
        snapshots = []
        for i in range(10):
            provider = "openai" if i < 5 else "anthropic"
            model = "gpt-3.5-turbo" if i < 5 else "claude-3-sonnet"
            snapshot = Snapshot(
                id=i + 1,
                trace_id=f"trace_{i}",
                provider=provider,
                model=model,
                payload={"messages": []},
                is_sanitized=False,
                status_code=200
            )
            snapshots.append(snapshot)
        
        mock_snapshot_repo.find_by_project_id.return_value = snapshots
        
        result = service.get_golden_case_summary(test_project.id)
        
        assert "total_snapshots" in result
        assert "available_for_testing" in result
        assert "by_provider" in result
        assert "by_model" in result
        assert result["total_snapshots"] == 10
        assert result["available_for_testing"] == 10
        assert "openai" in result["by_provider"]
        assert "anthropic" in result["by_provider"]
        assert result["by_provider"]["openai"] == 5
        assert result["by_provider"]["anthropic"] == 5

    def test_get_golden_case_summary_empty(self, db, test_project, service, mock_snapshot_repo):
        """Test getting summary when no snapshots exist"""
        mock_snapshot_repo.find_by_project_id.return_value = []
        
        result = service.get_golden_case_summary(test_project.id)
        
        assert result["total_snapshots"] == 0
        assert result["available_for_testing"] == 0
        assert result["by_provider"] == {}
        assert result["by_model"] == {}

    def test_get_golden_case_summary_max_limit(self, db, test_project, service, mock_snapshot_repo):
        """Test that available_for_testing is capped at 100"""
        # Create 200 snapshots
        snapshots = []
        for i in range(200):
            snapshot = Snapshot(
                id=i + 1,
                trace_id=f"trace_{i}",
                provider="openai",
                model="gpt-3.5-turbo",
                payload={"messages": []},
                is_sanitized=False,
                status_code=200
            )
            snapshots.append(snapshot)
        
        mock_snapshot_repo.find_by_project_id.return_value = snapshots
        
        result = service.get_golden_case_summary(test_project.id)
        
        assert result["total_snapshots"] == 200
        assert result["available_for_testing"] == 100  # Capped at 100

    def test_get_golden_case_summary_multiple_models(self, db, test_project, service, mock_snapshot_repo):
        """Test summary with multiple models"""
        snapshots = []
        models = ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"]
        for i in range(9):
            model = models[i % 3]
            snapshot = Snapshot(
                id=i + 1,
                trace_id=f"trace_{i}",
                provider="openai" if "gpt" in model else "anthropic",
                model=model,
                payload={"messages": []},
                is_sanitized=False,
                status_code=200
            )
            snapshots.append(snapshot)
        
        mock_snapshot_repo.find_by_project_id.return_value = snapshots
        
        result = service.get_golden_case_summary(test_project.id)
        
        assert len(result["by_model"]) == 3
        assert result["by_model"]["gpt-3.5-turbo"] == 3
        assert result["by_model"]["gpt-4"] == 3
        assert result["by_model"]["claude-3-sonnet"] == 3
