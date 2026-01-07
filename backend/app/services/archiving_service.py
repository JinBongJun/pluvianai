"""
Data archiving service for managing old data
"""
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.core.database import SessionLocal
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.models.drift_detection import DriftDetection


class ArchivingService:
    """Service for archiving old data to reduce database size"""
    
    def __init__(self, retention_days: int = 90):
        """
        Initialize archiving service
        
        Args:
            retention_days: Number of days to keep data before archiving
        """
        self.retention_days = retention_days
    
    def archive_old_data(self, project_id: Optional[int] = None) -> dict:
        """
        Archive data older than retention period
        
        Args:
            project_id: Optional project ID to archive. If None, archives all projects.
        
        Returns:
            Dictionary with archiving statistics
        """
        cutoff_date = datetime.utcnow() - timedelta(days=self.retention_days)
        db: Session = SessionLocal()
        
        stats = {
            "api_calls_deleted": 0,
            "quality_scores_deleted": 0,
            "drift_detections_deleted": 0,
            "cutoff_date": cutoff_date.isoformat()
        }
        
        try:
            # Build query filters
            filters = [APICall.created_at < cutoff_date]
            if project_id:
                filters.append(APICall.project_id == project_id)
            
            # Delete old API calls
            deleted_api_calls = db.query(APICall).filter(and_(*filters)).delete()
            stats["api_calls_deleted"] = deleted_api_calls
            
            # Delete orphaned quality scores (if any remain)
            if project_id:
                quality_filters = [
                    QualityScore.created_at < cutoff_date,
                    QualityScore.project_id == project_id
                ]
            else:
                quality_filters = [QualityScore.created_at < cutoff_date]
            
            deleted_quality = db.query(QualityScore).filter(and_(*quality_filters)).delete()
            stats["quality_scores_deleted"] = deleted_quality
            
            # Delete old drift detections
            if project_id:
                drift_filters = [
                    DriftDetection.detected_at < cutoff_date,
                    DriftDetection.project_id == project_id
                ]
            else:
                drift_filters = [DriftDetection.detected_at < cutoff_date]
            
            deleted_drift = db.query(DriftDetection).filter(and_(*drift_filters)).delete()
            stats["drift_detections_deleted"] = deleted_drift
            
            db.commit()
            
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()
        
        return stats
    
    def get_storage_stats(self, project_id: Optional[int] = None) -> dict:
        """
        Get storage statistics
        
        Returns:
            Dictionary with storage statistics
        """
        db: Session = SessionLocal()
        
        try:
            # Count API calls
            api_call_query = db.query(APICall)
            if project_id:
                api_call_query = api_call_query.filter(APICall.project_id == project_id)
            api_call_count = api_call_query.count()
            
            # Count by age
            cutoff_30 = datetime.utcnow() - timedelta(days=30)
            cutoff_90 = datetime.utcnow() - timedelta(days=90)
            
            old_30_query = api_call_query.filter(APICall.created_at < cutoff_30)
            old_90_query = api_call_query.filter(APICall.created_at < cutoff_90)
            
            old_30_count = old_30_query.count()
            old_90_count = old_90_query.count()
            
            return {
                "total_api_calls": api_call_count,
                "older_than_30_days": old_30_count,
                "older_than_90_days": old_90_count,
                "retention_days": self.retention_days
            }
        finally:
            db.close()


# Global instance with default 90-day retention
archiving_service = ArchivingService(retention_days=90)



