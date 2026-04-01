"""
Data Lifecycle Service for TTL enforcement and auto-archiving
"""

from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.behavior_report import BehaviorReport
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.release_gate_run import ReleaseGateRun
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.models.project import Project
from app.models.organization import Organization
from app.models.user import User
from app.models.subscription import Subscription
from app.core.subscription_limits import PLAN_LIMITS
from app.core.config import settings
from app.core.logging_config import logger


def _utcnow_naive() -> datetime:
    """Return a naive UTC timestamp without using deprecated utcnow()."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class DataLifecycleService:
    """Service for managing data retention and archiving"""

    def __init__(self, db: Session):
        self.db = db

    def get_retention_days(self, plan_type: str) -> int:
        """Get retention days for a plan"""
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])
        return limits.get("data_retention_days", 7)

    def _get_projects(self, project_id: Optional[int] = None) -> List[Project]:
        """Return either a single project or all projects."""
        if project_id is not None:
            project = self.db.query(Project).filter(Project.id == project_id).first()
            return [project] if project else []
        return self.db.query(Project).all()

    def _get_project_retention_context(
        self,
        project: Project,
        now: Optional[datetime] = None,
    ) -> Optional[Dict[str, Any]]:
        """Resolve plan and retention window for a project owner."""
        user = self.db.query(User).filter(User.id == project.owner_id).first()
        if not user:
            return None

        subscription = self.db.query(Subscription).filter(Subscription.user_id == user.id).first()
        plan_type = subscription.plan_type if subscription else "free"
        retention_days = self.get_retention_days(plan_type)
        cutoff_date = (now or _utcnow_naive()) - timedelta(days=retention_days)

        return {
            "plan_type": plan_type,
            "retention_days": retention_days,
            "cutoff_date": cutoff_date,
        }

    def _is_release_gate_report(self, report: BehaviorReport) -> bool:
        """Return True only for persisted release-gate runs."""
        return (
            isinstance(report.summary_json, dict)
            and isinstance(report.summary_json.get("release_gate"), dict)
        )

    def get_expired_snapshots(self, project_id: Optional[int] = None) -> List[Snapshot]:
        """
        Get snapshots that have exceeded their TTL
        Returns list of expired snapshots
        """
        projects = self._get_projects(project_id)
        if not projects:
            return []

        expired_snapshots = []
        now = _utcnow_naive()

        for project in projects:
            retention = self._get_project_retention_context(project, now=now)
            if not retention:
                continue

            # Find expired snapshots for this project
            expired = (
                self.db.query(Snapshot)
                .join(Trace)
                .filter(
                    and_(
                        Trace.project_id == project.id,
                        Snapshot.created_at < retention["cutoff_date"]
                    )
                )
                .all()
            )

            expired_snapshots.extend(expired)

        return expired_snapshots

    def mark_for_deletion(self, snapshot_ids: List[int]) -> int:
        """
        Mark snapshots for deletion (soft delete)
        Returns number of snapshots marked
        """
        # For MVP, we'll actually delete them
        # In production, you might want to mark them and archive to S3 first
        count = 0
        for snapshot_id in snapshot_ids:
            snapshot = self.db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()
            if snapshot:
                self.db.delete(snapshot)
                count += 1

        if count > 0:
            self.db.commit()
            logger.info(f"Marked {count} snapshots for deletion")

        return count

    def get_expired_release_gate_reports(self, project_id: Optional[int] = None) -> List[BehaviorReport]:
        """
        Get persisted release-gate reports that have exceeded their TTL.
        Only release-gate history is eligible; general behavior reports are preserved.
        """
        projects = self._get_projects(project_id)
        if not projects:
            return []

        expired_reports: List[BehaviorReport] = []
        now = _utcnow_naive()

        for project in projects:
            retention = self._get_project_retention_context(project, now=now)
            if not retention:
                continue

            candidates = (
                self.db.query(BehaviorReport)
                .filter(
                    BehaviorReport.project_id == project.id,
                    BehaviorReport.created_at < retention["cutoff_date"],
                )
                .all()
            )
            expired_reports.extend(
                report for report in candidates if self._is_release_gate_report(report)
            )

        return expired_reports

    def delete_behavior_reports(self, report_ids: List[str]) -> int:
        """Delete persisted behavior reports by id."""
        count = 0
        for report_id in report_ids:
            self.db.query(ReleaseGateRun).filter(ReleaseGateRun.report_id == report_id).delete()
            report = self.db.query(BehaviorReport).filter(BehaviorReport.id == report_id).first()
            if report:
                self.db.delete(report)
                count += 1

        if count > 0:
            self.db.commit()
            logger.info(f"Deleted {count} expired behavior reports")

        return count

    def purge_expired_release_gate_history(
        self,
        project_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Hard-delete expired release-gate history rows.
        Returns purge statistics.
        """
        expired_reports = self.get_expired_release_gate_reports(project_id)

        if not expired_reports:
            return {
                "expired_count": 0,
                "deleted_count": 0,
                "message": "No expired release-gate history found",
            }

        report_ids = [report.id for report in expired_reports]
        deleted_count = self.delete_behavior_reports(report_ids)

        return {
            "expired_count": len(expired_reports),
            "deleted_count": deleted_count,
            "message": f"Purged {deleted_count} expired release-gate history records",
        }

    def cleanup_expired_data(self, project_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Clean up expired data based on TTL
        Returns cleanup statistics
        """
        expired_snapshots = self.get_expired_snapshots(project_id)
        snapshot_ids = [s.id for s in expired_snapshots]
        deleted_snapshot_count = self.mark_for_deletion(snapshot_ids) if snapshot_ids else 0
        release_gate_cleanup = self.purge_expired_release_gate_history(project_id)

        if not expired_snapshots and release_gate_cleanup["expired_count"] == 0:
            return {
                "expired_count": 0,
                "deleted_count": 0,
                "expired_snapshots_count": 0,
                "deleted_snapshots_count": 0,
                "expired_release_gate_reports_count": 0,
                "deleted_release_gate_reports_count": 0,
                "message": "No expired data found",
            }

        message_parts = []
        if deleted_snapshot_count > 0:
            message_parts.append(f"{deleted_snapshot_count} expired snapshots")
        if release_gate_cleanup["deleted_count"] > 0:
            message_parts.append(
                f"{release_gate_cleanup['deleted_count']} expired release-gate history records"
            )
        if not message_parts:
            message_parts.append("0 expired records")

        return {
            "expired_count": len(expired_snapshots),
            "deleted_count": deleted_snapshot_count,
            "expired_snapshots_count": len(expired_snapshots),
            "deleted_snapshots_count": deleted_snapshot_count,
            "expired_release_gate_reports_count": release_gate_cleanup["expired_count"],
            "deleted_release_gate_reports_count": release_gate_cleanup["deleted_count"],
            "message": "Cleaned up " + " and ".join(message_parts),
        }

    def purge_soft_deleted_entities(self, grace_days: Optional[int] = None) -> Dict[str, int]:
        """
        Hard-delete projects/organizations that have been soft-deleted
        longer than the grace window.
        """
        grace_window_days = grace_days if grace_days is not None else settings.SOFT_DELETE_GRACE_DAYS
        cutoff = _utcnow_naive() - timedelta(days=grace_window_days)

        expired_projects = (
            self.db.query(Project)
            .filter(
                Project.is_deleted.is_(True),
                Project.deleted_at.isnot(None),
                Project.deleted_at < cutoff,
            )
            .all()
        )
        expired_orgs = (
            self.db.query(Organization)
            .filter(
                Organization.is_deleted.is_(True),
                Organization.deleted_at.isnot(None),
                Organization.deleted_at < cutoff,
            )
            .all()
        )

        purged_projects = 0
        purged_orgs = 0

        for project in expired_projects:
            self.db.delete(project)
            purged_projects += 1

        for org in expired_orgs:
            self.db.delete(org)
            purged_orgs += 1

        if purged_projects or purged_orgs:
            self.db.commit()
            logger.info(
                "Purged soft-deleted entities: %s projects, %s organizations (grace_days=%s)",
                purged_projects,
                purged_orgs,
                grace_window_days,
            )

        return {
            "grace_days": grace_window_days,
            "purged_projects_count": purged_projects,
            "purged_organizations_count": purged_orgs,
        }

    def purge_soft_deleted_snapshots(self, grace_days: Optional[int] = None) -> Dict[str, int]:
        """
        Hard-delete snapshots that have been soft-deleted longer than the grace window.
        """
        grace_window_days = grace_days if grace_days is not None else settings.SOFT_DELETE_GRACE_DAYS
        cutoff = _utcnow_naive() - timedelta(days=grace_window_days)

        expired_snapshots = (
            self.db.query(Snapshot)
            .filter(
                Snapshot.is_deleted.is_(True),
                Snapshot.deleted_at.isnot(None),
                Snapshot.deleted_at < cutoff,
            )
            .all()
        )

        purged_snapshots = 0
        for snapshot in expired_snapshots:
            self.db.delete(snapshot)
            purged_snapshots += 1

        if purged_snapshots:
            self.db.commit()
            logger.info(
                "Purged soft-deleted snapshots: %s rows (grace_days=%s)",
                purged_snapshots,
                grace_window_days,
            )

        return {
            "grace_days": grace_window_days,
            "purged_snapshots_count": purged_snapshots,
        }

    def purge_soft_deleted_agent_settings(self, grace_days: Optional[int] = None) -> Dict[str, int]:
        """
        Hard-delete agent display settings that have been soft-deleted
        longer than the grace window.
        """
        grace_window_days = (
            grace_days if grace_days is not None else settings.AGENT_SOFT_DELETE_GRACE_DAYS
        )
        cutoff = _utcnow_naive() - timedelta(days=grace_window_days)

        expired_agent_settings = (
            self.db.query(AgentDisplaySetting)
            .filter(
                AgentDisplaySetting.is_deleted.is_(True),
                AgentDisplaySetting.deleted_at.isnot(None),
                AgentDisplaySetting.deleted_at < cutoff,
            )
            .all()
        )

        purged_agent_settings = 0
        for agent_setting in expired_agent_settings:
            self.db.delete(agent_setting)
            purged_agent_settings += 1

        if purged_agent_settings:
            self.db.commit()
            logger.info(
                "Purged soft-deleted agent settings: %s rows (grace_days=%s)",
                purged_agent_settings,
                grace_window_days,
            )

        return {
            "grace_days": grace_window_days,
            "purged_agent_settings_count": purged_agent_settings,
        }

    def archive_to_s3(self, snapshot_ids: List[int], project_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Archive snapshots to S3 Glacier (Enterprise only)
        
        Args:
            snapshot_ids: List of snapshot IDs to archive
            project_id: Optional project ID (required for Enterprise plan check)
        
        Returns:
            Dict with archive results
        """
        if not snapshot_ids:
            return {
                "status": "error",
                "message": "No snapshot IDs provided",
                "archived_count": 0
            }

        # Get project_id from first snapshot if not provided
        if not project_id:
            first_snapshot = self.db.query(Snapshot).filter(Snapshot.id == snapshot_ids[0]).first()
            if not first_snapshot:
                return {
                    "status": "error",
                    "message": "Snapshot not found",
                    "archived_count": 0
                }
            # Get project_id from trace
            from app.models.trace import Trace
            trace = self.db.query(Trace).filter(Trace.id == first_snapshot.trace_id).first()
            if not trace:
                return {
                    "status": "error",
                    "message": "Trace not found",
                    "archived_count": 0
                }
            project_id = trace.project_id

        # Use S3GlacierService to archive
        from app.services.s3_glacier_service import S3GlacierService
        import asyncio
        
        glacier_service = S3GlacierService()
        
        # Run async archive operation
        try:
            # Try to get existing event loop
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Event loop is running, we need to use a different approach
                    # Create a new event loop in a thread
                    import concurrent.futures
                    import threading
                    
                    def run_async():
                        new_loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(new_loop)
                        try:
                            return new_loop.run_until_complete(
                                glacier_service.archive_snapshots(snapshot_ids, project_id, self.db)
                            )
                        finally:
                            new_loop.close()
                    
                    with concurrent.futures.ThreadPoolExecutor() as executor:
                        future = executor.submit(run_async)
                        result = future.result()
                else:
                    result = loop.run_until_complete(
                        glacier_service.archive_snapshots(snapshot_ids, project_id, self.db)
                    )
            except RuntimeError:
                # No event loop, create new one
                result = asyncio.run(
                    glacier_service.archive_snapshots(snapshot_ids, project_id, self.db)
                )
        except Exception as e:
            logger.error(
                f"Failed to archive snapshots to S3: {str(e)}",
                extra={"snapshot_ids": snapshot_ids, "project_id": project_id},
                exc_info=True
            )
            return {
                "status": "error",
                "message": f"Failed to archive: {str(e)}",
                "archived_count": 0
            }

        # If archiving was successful, delete snapshots from database
        if result.get("status") == "success" and result.get("archived_count", 0) > 0:
            # Only delete successfully archived snapshots
            archived_count = result.get("archived_count", 0)
            deleted_count = self.mark_for_deletion(snapshot_ids)
            
            result["deleted_count"] = deleted_count
            result["message"] = f"Archived {archived_count} snapshots to S3 Glacier"

        return result

    def get_data_retention_summary(self, project_id: int) -> Dict[str, Any]:
        """Get data retention summary for a project"""
        projects = self._get_projects(project_id)
        if not projects:
            return {"error": "Project not found"}
        project = projects[0]

        retention = self._get_project_retention_context(project)
        if not retention:
            return {"error": "User not found"}
        plan_type = retention["plan_type"]
        retention_days = retention["retention_days"]

        # Count total snapshots
        total_snapshots = (
            self.db.query(Snapshot)
            .join(Trace)
            .filter(Trace.project_id == project_id)
            .count()
        )

        # Count snapshots that will expire soon (within 1 day)
        cutoff_date = _utcnow_naive() - timedelta(days=retention_days - 1)
        expiring_soon = (
            self.db.query(Snapshot)
            .join(Trace)
            .filter(
                and_(
                    Trace.project_id == project_id,
                    Snapshot.created_at < cutoff_date
                )
            )
            .count()
        )

        return {
            "plan_type": plan_type,
            "retention_days": retention_days,
            "total_snapshots": total_snapshots,
            "expiring_soon": expiring_soon,
            "cutoff_date": (_utcnow_naive() - timedelta(days=retention_days)).isoformat(),
        }
