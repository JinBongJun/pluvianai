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
        
        self.scheduler.start()
        logger.info("Background scheduler started")
        logger.info("Scheduled tasks:")
        logger.info("  - Drift Detection: Daily at 2:00 AM UTC")
        logger.info("  - Cost Anomaly Detection: Daily at 3:00 AM UTC")
    
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


# Global instance
scheduler_service = SchedulerService()
