"""
Unit tests for OnboardingService
"""
import pytest
from unittest.mock import Mock, patch
from app.services.onboarding_service import OnboardingService
from app.models.user import User
from app.models.project import Project
from app.models.api_key import APIKey
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.models.user_agreement import UserAgreement


@pytest.mark.unit
class TestOnboardingService:
    """Tests for Onboarding Service"""

    def test_generate_quick_start_guide_success(self, db, test_user, test_project):
        """Test generating Quick Start guide with API key and project ID"""
        service = OnboardingService(db)
        
        result = service.generate_quick_start_guide(test_user.id, test_project.id)
        
        assert "curl_command" in result
        assert "python_code" in result
        assert "node_code" in result
        assert "api_key" in result
        assert result["project_id"] == test_project.id
        assert "api.pluvianai.com" in result["base_url"] or "localhost" in result["base_url"]
        assert result["api_key"] in result["curl_command"]
        assert result["api_key"] in result["python_code"]
        assert result["api_key"] in result["node_code"]

    def test_generate_quick_start_guide_no_project(self, db, test_user):
        """Test generating Quick Start guide when user has no project"""
        service = OnboardingService(db)
        
        result = service.generate_quick_start_guide(test_user.id, None)
        
        assert "curl_command" in result
        assert result["project_id"] is None
        assert "YOUR_PROJECT_ID" in result["curl_command"]

    def test_generate_quick_start_guide_no_api_key(self, db, test_user, test_project):
        """Test API key creation when user has no existing API key"""
        service = OnboardingService(db)
        
        # Ensure no API key exists
        db.query(APIKey).filter(APIKey.user_id == test_user.id).delete()
        db.commit()
        
        result = service.generate_quick_start_guide(test_user.id, test_project.id)
        
        assert "api_key" in result
        assert result["api_key"].startswith("ag_live_")
        
        # Verify API key was created in DB
        api_key_obj = db.query(APIKey).filter(APIKey.user_id == test_user.id).first()
        assert api_key_obj is not None
        assert api_key_obj.is_active is True

    def test_generate_quick_start_guide_existing_api_key(self, db, test_user, test_project):
        """Test using existing API key when user already has one"""
        service = OnboardingService(db)
        
        # Create existing API key
        from app.core.security import get_password_hash
        api_key_obj = APIKey(
            user_id=test_user.id,
            key_hash=get_password_hash("test_key"),
            name="Existing Key",
            is_active=True
        )
        db.add(api_key_obj)
        db.commit()
        
        result = service.generate_quick_start_guide(test_user.id, test_project.id)
        
        assert "api_key" in result
        # Should return placeholder for existing keys
        assert result["api_key"] == "ag_live_xxxxx"

    def test_generate_quick_start_guide_user_not_found(self, db):
        """Test generating guide for non-existent user"""
        service = OnboardingService(db)
        
        with pytest.raises(ValueError, match="User not found"):
            service.generate_quick_start_guide(99999, None)

    def test_simulate_virtual_traffic_success(self, db, test_user, test_project):
        """Test simulating virtual traffic successfully"""
        service = OnboardingService(db)
        
        result = service.simulate_virtual_traffic(test_user.id, test_project.id)
        
        assert "snapshots_created" in result
        assert result["snapshots_created"] == 3
        assert "snapshots" in result
        assert len(result["snapshots"]) == 3
        assert "message" in result
        
        # Verify snapshots were created in DB
        snapshot_count = db.query(Snapshot).join(Trace).filter(
            Trace.project_id == test_project.id
        ).count()
        assert snapshot_count == 3

    def test_simulate_virtual_traffic_invalid_project(self, db, test_user):
        """Test simulating traffic with invalid project ID"""
        service = OnboardingService(db)
        
        with pytest.raises(ValueError, match="Project not found or access denied"):
            service.simulate_virtual_traffic(test_user.id, 99999)

    def test_simulate_virtual_traffic_wrong_owner(self, db, test_user):
        """Test simulating traffic for project owned by different user"""
        service = OnboardingService(db)
        
        # Create another user and project
        other_user = User(
            email="other@example.com",
            hashed_password="hashed",
            full_name="Other User",
            is_active=True
        )
        db.add(other_user)
        db.commit()
        db.refresh(other_user)
        
        other_project = Project(
            name="Other Project",
            description="Test",
            owner_id=other_user.id,
            is_active=True
        )
        db.add(other_project)
        db.commit()
        db.refresh(other_project)
        
        with pytest.raises(ValueError, match="Project not found or access denied"):
            service.simulate_virtual_traffic(test_user.id, other_project.id)

    def test_check_onboarding_status_completed(self, db, test_user, test_project):
        """Test checking onboarding status when all steps are completed"""
        service = OnboardingService(db)
        
        # Create snapshot
        trace = Trace(id="test_trace", project_id=test_project.id)
        db.add(trace)
        db.flush()
        
        snapshot = Snapshot(
            trace_id="test_trace",
            provider="openai",
            model="gpt-3.5-turbo",
            payload={"messages": []},
            is_sanitized=False,
            status_code=200
        )
        db.add(snapshot)
        
        # Create agreement
        agreement = UserAgreement(
            user_id=test_user.id,
            liability_agreement_accepted=True
        )
        db.add(agreement)
        db.commit()
        
        result = service.check_onboarding_status(test_user.id)
        
        assert result["completed"] is True
        assert result["has_project"] is True
        assert result["has_snapshot"] is True
        assert result["has_agreement"] is True
        assert result["project_count"] == 1
        assert result["snapshot_count"] == 1

    def test_check_onboarding_status_incomplete(self, db, test_user):
        """Test checking onboarding status when steps are incomplete"""
        service = OnboardingService(db)
        
        result = service.check_onboarding_status(test_user.id)
        
        assert result["completed"] is False
        assert result["has_project"] is False
        assert result["has_snapshot"] is False
        assert result["has_agreement"] is False
        assert result["project_count"] == 0
        assert result["snapshot_count"] == 0

    def test_check_onboarding_status_partial(self, db, test_user, test_project):
        """Test checking onboarding status with partial completion"""
        service = OnboardingService(db)
        
        # Only project exists, no snapshot or agreement
        result = service.check_onboarding_status(test_user.id)
        
        assert result["completed"] is False
        assert result["has_project"] is True
        assert result["has_snapshot"] is False
        assert result["has_agreement"] is False

    def test_check_onboarding_status_user_not_found(self, db):
        """Test checking status for non-existent user"""
        service = OnboardingService(db)
        
        with pytest.raises(ValueError, match="User not found"):
            service.check_onboarding_status(99999)

    def test_celebrate_first_snapshot_true(self, db, test_user, test_project):
        """Test celebrating first snapshot when it's actually the first"""
        service = OnboardingService(db)
        
        # Create first snapshot
        trace = Trace(id="first_trace", project_id=test_project.id)
        db.add(trace)
        db.flush()
        
        snapshot = Snapshot(
            trace_id="first_trace",
            provider="openai",
            model="gpt-3.5-turbo",
            payload={"messages": []},
            is_sanitized=False,
            status_code=200
        )
        db.add(snapshot)
        db.commit()
        
        result = service.celebrate_first_snapshot(test_user.id, test_project.id)
        
        assert result["is_first_snapshot"] is True
        assert "Congratulations" in result["message"]
        assert "next_steps" in result
        assert len(result["next_steps"]) > 0

    def test_celebrate_first_snapshot_false(self, db, test_user, test_project):
        """Test celebrating when it's not the first snapshot"""
        service = OnboardingService(db)
        
        # Create multiple snapshots
        for i in range(3):
            trace = Trace(id=f"trace_{i}", project_id=test_project.id)
            db.add(trace)
            db.flush()
            
            snapshot = Snapshot(
                trace_id=f"trace_{i}",
                provider="openai",
                model="gpt-3.5-turbo",
                payload={"messages": []},
                is_sanitized=False,
                status_code=200
            )
            db.add(snapshot)
        
        db.commit()
        
        result = service.celebrate_first_snapshot(test_user.id, test_project.id)
        
        assert result["is_first_snapshot"] is False
        assert result["message"] is None

    def test_celebrate_first_snapshot_no_snapshots(self, db, test_user, test_project):
        """Test celebrating when no snapshots exist"""
        service = OnboardingService(db)
        
        result = service.celebrate_first_snapshot(test_user.id, test_project.id)
        
        assert result["is_first_snapshot"] is False
        assert result["message"] is None
