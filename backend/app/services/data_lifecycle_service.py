"""
Data Lifecycle Service for TTL enforcement and auto-archiving
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.models.project import Project
from app.models.user import User
from app.models.subscription import Subscription
from app.core.subscription_limits import PLAN_LIMITS
from app.core.logging_config import logger


class DataLifecycleService:
    """Service for managing data retention and archiving"""

    def __init__(self, db: Session):
        self.db = db

    def get_retention_days(self, plan_type: str) -> int:
        """Get retention days for a plan"""
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])
        return limits.get("data_retention_days", 7)

    def get_expired_snapshots(self, project_id: Optional[int] = None) -> List[Snapshot]:
        """
        Get snapshots that have exceeded their TTL
        Returns list of expired snapshots
        """
        # Get all projects with their plan types
        if project_id:
            projects = [self.db.query(Project).filter(Project.id == project_id).first()]
            if not projects[0]:
                return []
        else:
            projects = self.db.query(Project).all()

        expired_snapshots = []
        now = datetime.utcnow()

        for project in projects:
            # Get project owner's plan
            user = self.db.query(User).filter(User.id == project.owner_id).first()
            if not user:
                continue

            subscription = self.db.query(Subscription).filter(Subscription.user_id == user.id).first()
            plan_type = subscription.plan_type if subscription else "free"
            retention_days = self.get_retention_days(plan_type)

            # Calculate cutoff date
            cutoff_date = now - timedelta(days=retention_days)

            # Find expired snapshots for this project
            from app.models.trace import Trace
            expired = (
                self.db.query(Snapshot)
                .join(Trace)
                .filter(
                    and_(
                        Trace.project_id == project.id,
                        Snapshot.created_at < cutoff_date
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

    def cleanup_expired_data(self, project_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Clean up expired data based on TTL
        Returns cleanup statistics
        """
        expired_snapshots = self.get_expired_snapshots(project_id)
        
        if not expired_snapshots:
            return {
                "expired_count": 0,
                "deleted_count": 0,
                "message": "No expired data found",
            }

        snapshot_ids = [s.id for s in expired_snapshots]
        deleted_count = self.mark_for_deletion(snapshot_ids)

        return {
            "expired_count": len(expired_snapshots),
            "deleted_count": deleted_count,
            "message": f"Cleaned up {deleted_count} expired snapshots",
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
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"error": "Project not found"}

        # Get project owner's plan
        user = self.db.query(User).filter(User.id == project.owner_id).first()
        if not user:
            return {"error": "User not found"}

        subscription = self.db.query(Subscription).filter(Subscription.user_id == user.id).first()
        plan_type = subscription.plan_type if subscription else "free"
        retention_days = self.get_retention_days(plan_type)

        # Count total snapshots
        from app.models.trace import Trace
        total_snapshots = (
            self.db.query(Snapshot)
            .join(Trace)
            .filter(Trace.project_id == project_id)
            .count()
        )

        # Count snapshots that will expire soon (within 1 day)
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days - 1)
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
            "cutoff_date": (datetime.utcnow() - timedelta(days=retention_days)).isoformat(),
        }
