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
from app.services.webhook_service import webhook_service
from app.services.health_monitor import health_monitor
from app.core.logging_config import logger


class SchedulerService:
    """Service for scheduling periodic background tasks"""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.drift_engine = DriftEngine()
        self.cost_analyzer = CostAnalyzer()
        self.alert_service = AlertService()
    
    def start(self):
        """Start the scheduler"""
        # Schedule drift detection: Run daily at 2 AM UTC
        self.scheduler.add_job(
            self.run_drift_detection_all_projects,
            trigger=CronTrigger(hour=2, minute=0),  # 2 AM UTC daily
            id="drift_detection_daily",
            name="Daily Drift Detection",
            replace_existing=True
        )
        
        # Schedule cost anomaly detection: Run daily at 3 AM UTC
        self.scheduler.add_job(
            self.run_cost_anomaly_detection_all_projects,
            trigger=CronTrigger(hour=3, minute=0),  # 3 AM UTC daily
            id="cost_anomaly_detection_daily",
            name="Daily Cost Anomaly Detection",
            replace_existing=True
        )
        
        # Schedule health check: Run hourly
        self.scheduler.add_job(
            self.run_health_check,
            trigger=CronTrigger(minute=0),  # Every hour at :00
            id="health_check_hourly",
            name="Hourly Health Check",
            replace_existing=True
        )
        
        # Schedule infrastructure cost check: Run daily at 9 AM UTC
        self.scheduler.add_job(
            self.run_infrastructure_cost_check,
            trigger=CronTrigger(hour=9, minute=0),  # 9 AM UTC daily
            id="infrastructure_cost_check_daily",
            name="Daily Infrastructure Cost Check",
            replace_existing=True
        )
        
        self.scheduler.start()
        logger.info("Background scheduler started")
        logger.info("Scheduled tasks:")
        logger.info("  - Drift Detection: Daily at 2:00 AM UTC")
        logger.info("  - Cost Anomaly Detection: Daily at 3:00 AM UTC")
        logger.info("  - Health Check: Hourly")
        logger.info("  - Infrastructure Cost Check: Daily at 9:00 AM UTC")
    
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
            projects = db.query(Project).filter(Project.is_active == True).all()
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
                        db=db
                    )
                    
                    if detections:
                        total_detections += len(detections)
                        logger.info(f"Project {project.id}: Found {len(detections)} drift detections")
                        
                        # Get alerts created by drift detection
                        from app.models.alert import Alert
                        from datetime import timedelta
                        
                        alerts = db.query(Alert).filter(
                            Alert.project_id == project.id,
                            Alert.alert_type == "drift",
                            Alert.created_at >= datetime.utcnow() - timedelta(seconds=10)
                        ).all()
                        
                        # Send alerts and trigger webhooks
                        for alert in alerts:
                            try:
                                await self.alert_service.send_alert(alert, db=db)
                                await webhook_service.trigger_alert_webhooks(alert, db)
                                total_alerts += 1
                            except Exception as e:
                                logger.error(f"Error sending alert {alert.id}: {str(e)}")
                    else:
                        logger.debug(f"Project {project.id}: No drift detected")
                        
                except Exception as e:
                    logger.error(f"Error running drift detection for project {project.id}: {str(e)}")
                    continue
            
            logger.info(f"Scheduled drift detection completed: {total_detections} detections, {total_alerts} alerts sent")
            
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
            projects = db.query(Project).filter(Project.is_active == True).all()
            logger.info(f"Found {len(projects)} active projects")
            
            total_alerts = 0
            
            for project in projects:
                try:
                    # Run cost anomaly detection
                    alerts = self.cost_analyzer.detect_cost_anomalies(
                        project_id=project.id,
                        db=db
                    )
                    
                    if alerts:
                        total_alerts += len(alerts)
                        logger.info(f"Project {project.id}: Found {len(alerts)} cost anomalies")
                        
                        # Send alerts and trigger webhooks
                        for alert in alerts:
                            try:
                                await self.alert_service.send_alert(alert, db=db)
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
            projects = db.query(Project).filter(Project.is_active == True).all()
            logger.info(f"Found {len(projects)} active projects")
            
            for project in projects:
                try:
                    # Check infrastructure costs (budget limit would come from project settings)
                    # For now, use None as budget limit
                    cost_result = await infrastructure_cost_monitor.check_and_alert(
                        project_id=project.id,
                        budget_limit=None,  # Would get from project settings
                        db=db
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


# Global instance
scheduler_service = SchedulerService()
