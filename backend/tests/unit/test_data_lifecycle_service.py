"""
Unit tests for DataLifecycleService
"""
import pytest
from datetime import datetime, timedelta
from app.services.data_lifecycle_service import DataLifecycleService
from app.models.behavior_report import BehaviorReport
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.models.project import Project
from app.models.organization import Organization
from app.models.user import User
from app.models.subscription import Subscription


@pytest.mark.unit
class TestDataLifecycleService:
    """Tests for Data Lifecycle Service"""

    @pytest.fixture
    def service(self, db):
        """Create DataLifecycleService instance"""
        return DataLifecycleService(db)

    def test_get_retention_days_by_plan(self, service):
        """Test getting retention days for different plans"""
        assert service.get_retention_days("free") == 7
        assert service.get_retention_days("pro") == 30
        assert service.get_retention_days("enterprise") == 365
        
        # Unknown plan defaults to free
        assert service.get_retention_days("unknown") == 7

    def test_get_expired_snapshots_success(self, db, test_user, test_project, service):
        """Test getting expired snapshots successfully"""
        # Create subscription
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        # Create trace
        trace = Trace(id="test_trace", project_id=test_project.id)
        db.add(trace)
        db.flush()
        
        # Create expired snapshot (older than 7 days for free plan)
        expired_snapshot = Snapshot(
            trace_id="test_trace",
            provider="openai",
            model="gpt-3.5-turbo",
            payload={"messages": []},
            is_sanitized=False,
            status_code=200,
            created_at=datetime.utcnow() - timedelta(days=10)
        )
        db.add(expired_snapshot)
        
        # Create non-expired snapshot
        recent_snapshot = Snapshot(
            trace_id="test_trace",
            provider="openai",
            model="gpt-4",
            payload={"messages": []},
            is_sanitized=False,
            status_code=200,
            created_at=datetime.utcnow() - timedelta(days=3)
        )
        db.add(recent_snapshot)
        db.commit()
        
        result = service.get_expired_snapshots()
        
        assert len(result) >= 1
        assert any(s.id == expired_snapshot.id for s in result)
        assert not any(s.id == recent_snapshot.id for s in result)

    def test_get_expired_snapshots_by_project(self, db, test_user, test_project, service):
        """Test getting expired snapshots for specific project"""
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        trace = Trace(id="test_trace", project_id=test_project.id)
        db.add(trace)
        db.flush()
        
        expired_snapshot = Snapshot(
            trace_id="test_trace",
            provider="openai",
            model="gpt-3.5-turbo",
            payload={"messages": []},
            is_sanitized=False,
            status_code=200,
            created_at=datetime.utcnow() - timedelta(days=10)
        )
        db.add(expired_snapshot)
        db.commit()
        
        result = service.get_expired_snapshots(project_id=test_project.id)
        
        assert len(result) >= 1
        assert any(s.id == expired_snapshot.id for s in result)

    def test_get_expired_snapshots_different_plans(self, db, test_user, test_project, service):
        """Test expired snapshots respect different plan retention periods"""
        # Create Pro subscription
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="pro",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        trace = Trace(id="test_trace", project_id=test_project.id)
        db.add(trace)
        db.flush()
        
        # Snapshot older than 7 days but less than 30 days (should not be expired for Pro)
        snapshot_15_days = Snapshot(
            trace_id="test_trace",
            provider="openai",
            model="gpt-3.5-turbo",
            payload={"messages": []},
            is_sanitized=False,
            status_code=200,
            created_at=datetime.utcnow() - timedelta(days=15)
        )
        db.add(snapshot_15_days)
        db.commit()
        
        result = service.get_expired_snapshots(project_id=test_project.id)
        
        # Should not be expired (Pro plan has 30 days retention)
        assert not any(s.id == snapshot_15_days.id for s in result)

    def test_get_expired_snapshots_no_project(self, db, service):
        """Test getting expired snapshots for non-existent project"""
        result = service.get_expired_snapshots(project_id=99999)
        assert result == []

    def test_enforce_ttl_success(self, db, test_user, test_project, service):
        """Test enforcing TTL (cleanup_expired_data)"""
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        trace = Trace(id="test_trace", project_id=test_project.id)
        db.add(trace)
        db.flush()
        
        expired_snapshot = Snapshot(
            trace_id="test_trace",
            provider="openai",
            model="gpt-3.5-turbo",
            payload={"messages": []},
            is_sanitized=False,
            status_code=200,
            created_at=datetime.utcnow() - timedelta(days=10)
        )
        db.add(expired_snapshot)
        db.commit()
        expired_id = expired_snapshot.id
        
        result = service.cleanup_expired_data(project_id=test_project.id)
        
        assert result["expired_count"] >= 1
        assert result["deleted_count"] >= 1
        assert "Cleaned up" in result["message"]
        
        # Verify snapshot was deleted
        deleted = db.query(Snapshot).filter(Snapshot.id == expired_id).first()
        assert deleted is None

    def test_enforce_ttl_no_expired(self, db, test_user, test_project, service):
        """Test enforcing TTL when no expired data exists"""
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        result = service.cleanup_expired_data(project_id=test_project.id)
        
        assert result["expired_count"] == 0
        assert result["deleted_count"] == 0
        assert "No expired data found" in result["message"]

    def test_get_expired_release_gate_reports_only_returns_release_gate_rows(self, db, test_user, test_project, service):
        """Test expired release-gate history only includes release-gate reports."""
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)

        expired_release_gate = BehaviorReport(
            project_id=test_project.id,
            trace_id="trace-rg-expired",
            agent_id="agent-1",
            status="pass",
            summary_json={"release_gate": {"mode": "replay_test"}},
            violations_json=[],
            created_at=datetime.utcnow() - timedelta(days=10),
        )
        expired_behavior = BehaviorReport(
            project_id=test_project.id,
            trace_id="trace-behavior-expired",
            agent_id="agent-1",
            status="fail",
            summary_json={"behavior": {"mode": "policy"}},
            violations_json=[],
            created_at=datetime.utcnow() - timedelta(days=10),
        )
        recent_release_gate = BehaviorReport(
            project_id=test_project.id,
            trace_id="trace-rg-recent",
            agent_id="agent-1",
            status="pass",
            summary_json={"release_gate": {"mode": "replay_test"}},
            violations_json=[],
            created_at=datetime.utcnow() - timedelta(days=2),
        )
        db.add_all([expired_release_gate, expired_behavior, recent_release_gate])
        db.commit()

        result = service.get_expired_release_gate_reports(project_id=test_project.id)
        report_ids = {report.id for report in result}

        assert expired_release_gate.id in report_ids
        assert expired_behavior.id not in report_ids
        assert recent_release_gate.id not in report_ids

    def test_purge_expired_release_gate_history_deletes_only_release_gate_rows(self, db, test_user, test_project, service):
        """Test purge removes expired release-gate rows but keeps other behavior reports."""
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)

        expired_release_gate = BehaviorReport(
            project_id=test_project.id,
            trace_id="trace-rg-expired",
            agent_id="agent-1",
            status="pass",
            summary_json={"release_gate": {"mode": "replay_test"}},
            violations_json=[],
            created_at=datetime.utcnow() - timedelta(days=10),
        )
        expired_behavior = BehaviorReport(
            project_id=test_project.id,
            trace_id="trace-behavior-expired",
            agent_id="agent-1",
            status="fail",
            summary_json={"behavior": {"mode": "policy"}},
            violations_json=[],
            created_at=datetime.utcnow() - timedelta(days=10),
        )
        recent_release_gate = BehaviorReport(
            project_id=test_project.id,
            trace_id="trace-rg-recent",
            agent_id="agent-1",
            status="pass",
            summary_json={"release_gate": {"mode": "replay_test"}},
            violations_json=[],
            created_at=datetime.utcnow() - timedelta(days=2),
        )
        db.add_all([expired_release_gate, expired_behavior, recent_release_gate])
        db.commit()

        result = service.purge_expired_release_gate_history(project_id=test_project.id)

        assert result["expired_count"] == 1
        assert result["deleted_count"] == 1
        assert db.query(BehaviorReport).filter(BehaviorReport.id == expired_release_gate.id).first() is None
        assert db.query(BehaviorReport).filter(BehaviorReport.id == expired_behavior.id).first() is not None
        assert db.query(BehaviorReport).filter(BehaviorReport.id == recent_release_gate.id).first() is not None

    def test_cleanup_expired_data_reports_snapshot_and_history_counts(self, db, test_user, test_project, service):
        """Test cleanup returns both snapshot and release-gate history deletion stats."""
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()

        trace = Trace(id="test_trace_cleanup", project_id=test_project.id)
        db.add(trace)
        db.flush()

        expired_snapshot = Snapshot(
            trace_id="test_trace_cleanup",
            provider="openai",
            model="gpt-3.5-turbo",
            payload={"messages": []},
            is_sanitized=False,
            status_code=200,
            created_at=datetime.utcnow() - timedelta(days=10)
        )
        expired_release_gate = BehaviorReport(
            project_id=test_project.id,
            trace_id="trace-rg-expired",
            agent_id="agent-1",
            status="pass",
            summary_json={"release_gate": {"mode": "replay_test"}},
            violations_json=[],
            created_at=datetime.utcnow() - timedelta(days=10),
        )
        db.add_all([expired_snapshot, expired_release_gate])
        db.commit()

        expired_snapshot_id = expired_snapshot.id
        expired_report_id = expired_release_gate.id

        result = service.cleanup_expired_data(project_id=test_project.id)

        assert result["expired_snapshots_count"] == 1
        assert result["deleted_snapshots_count"] == 1
        assert result["expired_release_gate_reports_count"] == 1
        assert result["deleted_release_gate_reports_count"] == 1
        assert db.query(Snapshot).filter(Snapshot.id == expired_snapshot_id).first() is None
        assert db.query(BehaviorReport).filter(BehaviorReport.id == expired_report_id).first() is None

    def test_purge_soft_deleted_entities_hard_deletes_expired_rows(self, db, test_user, service):
        """Soft-deleted entities older than grace window are hard-deleted."""
        org = Organization(
            name="Deleted Org",
            owner_id=test_user.id,
            plan_type="free",
            is_deleted=True,
            deleted_at=datetime.utcnow() - timedelta(days=31),
        )
        db.add(org)
        db.flush()

        project = Project(
            name="Deleted Project",
            owner_id=test_user.id,
            organization_id=org.id,
            is_active=False,
            is_deleted=True,
            deleted_at=datetime.utcnow() - timedelta(days=31),
        )
        db.add(project)
        db.commit()

        result = service.purge_soft_deleted_entities(grace_days=30)

        assert result["purged_projects_count"] >= 1
        assert result["purged_organizations_count"] >= 1
        assert db.query(Project).filter(Project.id == project.id).first() is None
        assert db.query(Organization).filter(Organization.id == org.id).first() is None

    def test_auto_archive_success(self, db, test_user, test_project, service):
        """Test auto-archiving snapshots"""
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
        db.commit()
        snapshot_id = snapshot.id
        
        # Archive should mark for deletion (MVP implementation)
        result = service.archive_to_s3([snapshot_id])
        
        # Should return count of deleted snapshots
        assert isinstance(result, int)
        assert result >= 0

    def test_mark_for_deletion_success(self, db, test_user, test_project, service):
        """Test marking snapshots for deletion"""
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
        db.commit()
        snapshot_id = snapshot.id
        
        count = service.mark_for_deletion([snapshot_id])
        
        assert count == 1
        
        # Verify snapshot was deleted
        deleted = db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()
        assert deleted is None

    def test_mark_for_deletion_multiple(self, db, test_user, test_project, service):
        """Test marking multiple snapshots for deletion"""
        trace = Trace(id="test_trace", project_id=test_project.id)
        db.add(trace)
        db.flush()
        
        snapshot_ids = []
        for i in range(3):
            snapshot = Snapshot(
                trace_id="test_trace",
                provider="openai",
                model="gpt-3.5-turbo",
                payload={"messages": []},
                is_sanitized=False,
                status_code=200
            )
            db.add(snapshot)
            snapshot_ids.append(snapshot.id)
        
        db.commit()
        
        count = service.mark_for_deletion(snapshot_ids)
        
        assert count == 3
        
        # Verify all were deleted
        for snapshot_id in snapshot_ids:
            deleted = db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()
            assert deleted is None

    def test_get_data_retention_summary_success(self, db, test_user, test_project, service):
        """Test getting data retention summary"""
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
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
        db.commit()
        
        result = service.get_data_retention_summary(test_project.id)
        
        assert "plan_type" in result
        assert "retention_days" in result
        assert "total_snapshots" in result
        assert "expiring_soon" in result
        assert "cutoff_date" in result
        assert result["plan_type"] == "free"
        assert result["retention_days"] == 7
        assert result["total_snapshots"] == 1

    def test_get_data_retention_summary_no_project(self, db, service):
        """Test getting summary for non-existent project"""
        result = service.get_data_retention_summary(99999)
        
        assert "error" in result
        assert "Project not found" in result["error"]
