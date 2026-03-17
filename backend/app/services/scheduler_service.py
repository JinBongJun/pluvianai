"""
Background scheduler service for periodic tasks
"""

import asyncio
from datetime import datetime
from typing import List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.project import Project
from app.services.drift_engine import DriftEngine
from app.services.cost_analyzer import CostAnalyzer
from app.services.alert_service import AlertService
from app.infrastructure.repositories.alert_repository import AlertRepository
from app.services.webhook_service import webhook_service
from app.services.health_monitor import health_monitor
from app.services.infrastructure_cost_monitor import infrastructure_cost_monitor
from app.core.logging_config import logger
from app.core.config import settings


class SchedulerService:
    """Service for scheduling periodic background tasks"""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.drift_engine = DriftEngine()
        self.cost_analyzer = CostAnalyzer()
        # AlertService will be created with DB session when needed

    def _get_alert_service(self, db: Session) -> AlertService:
        """Get AlertService instance with DB session"""
        alert_repo = AlertRepository(db)
        return AlertService(alert_repo, db)

    def start(self):
        """Start the scheduler"""
        # Schedule drift detection: Run daily at 2 AM UTC
        self.scheduler.add_job(
            self.run_drift_detection_all_projects,
            trigger=CronTrigger(hour=2, minute=0),  # 2 AM UTC daily
            id="drift_detection_daily",
            name="Daily Drift Detection",
            replace_existing=True,
        )

        # Schedule cost anomaly detection: Run daily at 3 AM UTC
        self.scheduler.add_job(
            self.run_cost_anomaly_detection_all_projects,
            trigger=CronTrigger(hour=3, minute=0),  # 3 AM UTC daily
            id="cost_anomaly_detection_daily",
            name="Daily Cost Anomaly Detection",
            replace_existing=True,
        )

        # Schedule health check: Run hourly
        self.scheduler.add_job(
            self.run_health_check,
            trigger=CronTrigger(minute=0),  # Every hour at :00
            id="health_check_hourly",
            name="Hourly Health Check",
            replace_existing=True,
        )

        # Schedule infrastructure cost check: Run daily at 9 AM UTC
        self.scheduler.add_job(
            self.run_infrastructure_cost_check,
            trigger=CronTrigger(hour=9, minute=0),  # 9 AM UTC daily
            id="infrastructure_cost_check_daily",
            name="Daily Infrastructure Cost Check",
            replace_existing=True,
        )

        # Schedule data lifecycle cleanup: Run daily at 4 AM UTC
        self.scheduler.add_job(
            self.run_data_lifecycle_cleanup,
            trigger=CronTrigger(hour=4, minute=0),  # 4 AM UTC daily
            id="data_lifecycle_cleanup_daily",
            name="Daily Data Lifecycle Cleanup",
            replace_existing=True,
        )

        # Schedule monthly usage reset: Run on the 1st of each month at 1 AM UTC
        self.scheduler.add_job(
            self.run_monthly_usage_reset,
            trigger=CronTrigger(day=1, hour=1, minute=0),  # 1st of month at 1 AM UTC
            id="monthly_usage_reset",
            name="Monthly Usage Reset",
            replace_existing=True,
        )

        # Schedule daily database backup: Run daily at 5 AM UTC
        self.scheduler.add_job(
            self.run_daily_backup,
            trigger=CronTrigger(hour=5, minute=0),  # 5 AM UTC daily
            id="daily_backup",
            name="Daily Database Backup",
            replace_existing=True,
        )

        self.scheduler.start()
        logger.info("Background scheduler started")
        logger.info("Scheduled tasks:")
        logger.info("  - Drift Detection: Daily at 2:00 AM UTC")
        logger.info("  - Cost Anomaly Detection: Daily at 3:00 AM UTC")
        logger.info("  - Health Check: Hourly")
        logger.info("  - Infrastructure Cost Check: Daily at 9:00 AM UTC")
        logger.info("  - Data Lifecycle Cleanup: Daily at 4:00 AM UTC")
        logger.info("  - Monthly Usage Reset: 1st of month at 1:00 AM UTC")
        logger.info("  - Daily Database Backup: Daily at 5:00 AM UTC")

    def shutdown(self):
        """Shutdown the scheduler"""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Background scheduler stopped")

    async def run_drift_detection_all_projects(self):
        """Run drift detection for all active projects"""
        logger.info("Starting scheduled drift detection for all projects...")
        db: Session = SessionLocal()
        try:
            # Get all active projects
            projects = (
                db.query(Project)
                .filter(Project.is_active.is_(True), Project.is_deleted.is_(False))
                .all()
            )
            logger.info(f"Found {len(projects)} active projects")

            total_detections = 0
            total_alerts = 0

            for project in projects:
                try:
                    # Run drift detection
                    detections = self.drift_engine.detect_drift(
                        project_id=project.id,
                        model=None,  # Check all models
                        agent_name=None,  # Check all agents
                        db=db,
                    )

                    if detections:
                        total_detections += len(detections)
                        logger.info(f"Project {project.id}: Found {len(detections)} drift detections")

                        # Get alerts created by drift detection
                        from app.models.alert import Alert
                        from datetime import timedelta

                        alerts = (
                            db.query(Alert)
                            .filter(
                                Alert.project_id == project.id,
                                Alert.alert_type == "drift",
                                Alert.created_at >= datetime.utcnow() - timedelta(seconds=10),
                            )
                            .all()
                        )

                        # Send alerts and trigger webhooks
                        alert_service = self._get_alert_service(db)
                        for alert in alerts:
                            try:
                                await alert_service.send_alert(alert, ["email"], db=db)
                                await webhook_service.trigger_alert_webhooks(alert, db)
                                total_alerts += 1
                            except Exception as e:
                                logger.error(f"Error sending alert {alert.id}: {str(e)}")
                    else:
                        logger.debug(f"Project {project.id}: No drift detected")

                except Exception as e:
                    logger.error(f"Error running drift detection for project {project.id}: {str(e)}")
                    continue

            logger.info(
                f"Scheduled drift detection completed: {total_detections} detections, {total_alerts} alerts sent"
            )

        except Exception as e:
            logger.error(f"Error in scheduled drift detection: {str(e)}")
        finally:
            db.close()

    async def run_cost_anomaly_detection_all_projects(self):
        """Run cost anomaly detection for all active projects"""
        logger.info("Starting scheduled cost anomaly detection for all projects...")
        db: Session = SessionLocal()
        try:
            # Get all active projects
            projects = (
                db.query(Project)
                .filter(Project.is_active.is_(True), Project.is_deleted.is_(False))
                .all()
            )
            logger.info(f"Found {len(projects)} active projects")

            total_alerts = 0

            for project in projects:
                try:
                    # Run cost anomaly detection
                    alerts = self.cost_analyzer.detect_cost_anomalies(project_id=project.id, db=db)

                    if alerts:
                        total_alerts += len(alerts)
                        logger.info(f"Project {project.id}: Found {len(alerts)} cost anomalies")

                        # Send alerts and trigger webhooks
                        for alert in alerts:
                            try:
                                alert_service = self._get_alert_service(db)
                                await alert_service.send_alert(alert, ["email"], db=db)
                                await webhook_service.trigger_alert_webhooks(alert, db)
                            except Exception as e:
                                logger.error(f"Error sending alert {alert.id}: {str(e)}")
                    else:
                        logger.debug(f"Project {project.id}: No cost anomalies detected")

                except Exception as e:
                    logger.error(f"Error running cost anomaly detection for project {project.id}: {str(e)}")
                    continue

            logger.info(f"Scheduled cost anomaly detection completed: {total_alerts} alerts sent")

        except Exception as e:
            logger.error(f"Error in scheduled cost anomaly detection: {str(e)}")
        finally:
            db.close()

    async def run_health_check(self):
        """Run health check and send alerts if needed"""
        logger.info("Starting scheduled health check...")
        db: Session = SessionLocal()
        try:
            # Check system health
            health_result = await health_monitor.monitor_health_and_alert(db=db)

            if health_result.get("should_alert"):
                logger.warning(f"Health check found issues: {health_result.get('alert_message')}")
            else:
                logger.info("Health check completed: System healthy")
        except Exception as e:
            logger.error(f"Error in scheduled health check: {str(e)}")
        finally:
            db.close()

    async def run_infrastructure_cost_check(self):
        """Run infrastructure cost check and send alerts if budget exceeded"""
        logger.info("Starting scheduled infrastructure cost check...")
        db: Session = SessionLocal()
        try:
            from app.models.project import Project

            # Get all active projects
            projects = (
                db.query(Project)
                .filter(Project.is_active.is_(True), Project.is_deleted.is_(False))
                .all()
            )
            logger.info(f"Found {len(projects)} active projects")

            for project in projects:
                try:
                    # Check infrastructure costs (budget limit would come from project settings)
                    # For now, use None as budget limit
                    cost_result = await infrastructure_cost_monitor.check_and_alert(
                        project_id=project.id, budget_limit=None, db=db  # Would get from project settings
                    )

                    if cost_result.get("budget_warning") or cost_result.get("budget_exceeded"):
                        logger.warning(f"Project {project.id}: Budget alert sent")
                except Exception as e:
                    logger.error(f"Error checking costs for project {project.id}: {str(e)}")
                    continue

            logger.info("Scheduled infrastructure cost check completed")
        except Exception as e:
            logger.error(f"Error in scheduled infrastructure cost check: {str(e)}")
        finally:
            db.close()

    async def run_data_lifecycle_cleanup(self):
        """Run data lifecycle cleanup (TTL enforcement) for all projects"""
        logger.info("Starting scheduled data lifecycle cleanup...")
        db: Session = SessionLocal()
        try:
            from app.services.data_lifecycle_service import DataLifecycleService

            # Get all active projects
            projects = (
                db.query(Project)
                .filter(Project.is_active.is_(True), Project.is_deleted.is_(False))
                .all()
            )
            logger.info(f"Found {len(projects)} active projects")

            total_snapshots_cleaned = 0
            total_release_gate_reports_cleaned = 0
            lifecycle_service = DataLifecycleService(db)

            for project in projects:
                try:
                    # Run cleanup for this project
                    result = lifecycle_service.cleanup_expired_data(project_id=project.id)
                    deleted_snapshots = result.get("deleted_snapshots_count", result.get("deleted_count", 0))
                    deleted_reports = result.get("deleted_release_gate_reports_count", 0)
                    if deleted_snapshots > 0 or deleted_reports > 0:
                        total_snapshots_cleaned += deleted_snapshots
                        total_release_gate_reports_cleaned += deleted_reports
                        logger.info(
                            "Project %s: Cleaned up %s expired snapshots and %s expired release-gate history records",
                            project.id,
                            deleted_snapshots,
                            deleted_reports,
                        )
                except Exception as e:
                    logger.error(f"Error cleaning up data for project {project.id}: {str(e)}")
                    continue

            soft_delete_purge = lifecycle_service.purge_soft_deleted_entities()
            agent_setting_purge = lifecycle_service.purge_soft_deleted_agent_settings()
            logger.info(
                (
                    "Scheduled data lifecycle cleanup completed: %s snapshots cleaned, "
                    "%s release-gate history records purged, %s soft-deleted projects hard-deleted, "
                    "%s soft-deleted organizations hard-deleted, %s soft-deleted agent settings hard-deleted"
                ),
                total_snapshots_cleaned,
                total_release_gate_reports_cleaned,
                soft_delete_purge.get("purged_projects_count", 0),
                soft_delete_purge.get("purged_organizations_count", 0),
                agent_setting_purge.get("purged_agent_settings_count", 0),
            )
        except Exception as e:
            logger.error(f"Error in scheduled data lifecycle cleanup: {str(e)}")
        finally:
            db.close()

    async def run_monthly_usage_reset(self):
        """Run monthly usage reset for all users"""
        logger.info("Starting scheduled monthly usage reset...")
        db: Session = SessionLocal()
        try:
            from app.services.subscription_service import SubscriptionService

            subscription_service = SubscriptionService(db)
            reset_count = subscription_service.reset_monthly_usage()
            logger.info(f"Scheduled monthly usage reset completed: {reset_count} users reset")
        except Exception as e:
            logger.error(f"Error in scheduled monthly usage reset: {str(e)}")
        finally:
            db.close()

    async def run_daily_backup(self):
        """Run daily database backup"""
        logger.info("Starting scheduled daily database backup...")
        db: Session = SessionLocal()
        try:
            # Import BackupService from scripts
            import sys
            from pathlib import Path
            scripts_path = Path(__file__).parent.parent.parent / "scripts"
            if str(scripts_path) not in sys.path:
                sys.path.insert(0, str(scripts_path))
            
            from backup import BackupService

            backup_service = BackupService(backup_dir=settings.BACKUP_DIR)
            try:
                backup_path = backup_service.create_backup()
                logger.info(f"Daily backup created successfully: {backup_path}")
                
                # Cleanup old backups (keep 30 days)
                deleted = backup_service.cleanup_old_backups(keep_days=30)
                if deleted > 0:
                    logger.info(f"Cleaned up {deleted} old backups")
            except Exception as backup_error:
                logger.error(f"Backup failed: {str(backup_error)}", exc_info=True)
                
                # Send alert for backup failure
                try:
                    from app.models.alert import Alert
                    from app.models.project import Project
                    
                    # Find first active project to associate alert with
                    project = (
                        db.query(Project)
                        .filter(Project.is_active.is_(True), Project.is_deleted.is_(False))
                        .first()
                    )
                    if project:
                        alert = Alert(
                            project_id=project.id,
                            alert_type="system_backup",
                            severity="critical",
                            title="Database Backup Failed",
                            message=f"Daily database backup failed: {str(backup_error)}",
                            alert_data={
                                "error": str(backup_error),
                                "backup_dir": settings.BACKUP_DIR,
                            },
                            notification_channels=["email"],
                        )
                        db.add(alert)
                        db.commit()
                        
                        # Send alert
                        alert_service = self._get_alert_service(db)
                        await alert_service.send_alert(alert, ["email"], db=db)
                        logger.warning("Backup failure alert sent")
                    else:
                        logger.warning("No active project found to associate backup failure alert with")
                except Exception as alert_error:
                    logger.error(f"Failed to send backup failure alert: {str(alert_error)}", exc_info=True)
        except Exception as e:
            logger.error(f"Error in scheduled daily backup: {str(e)}", exc_info=True)
        finally:
            db.close()


# Global instance
scheduler_service = SchedulerService()
