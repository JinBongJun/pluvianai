from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta
from app.models.alert import Alert
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository

class AlertRepository(SQLAlchemyRepository[Alert]):
    """Alert repository with domain-specific queries"""
    
    def __init__(self, db: Session):
        super().__init__(db, Alert)
    
    def find_by_project_id(
        self,
        project_id: int,
        limit: int = 100,
        offset: int = 0,
        alert_type: Optional[str] = None,
        severity: Optional[str] = None,
        is_resolved: Optional[bool] = None
    ) -> List[Alert]:
        """Find alerts by project with filters"""
        query = self.db.query(Alert).filter(Alert.project_id == project_id)
        
        if alert_type:
            query = query.filter(Alert.alert_type == alert_type)
        if severity:
            query = query.filter(Alert.severity == severity)
        if is_resolved is not None:
            query = query.filter(Alert.is_resolved == is_resolved)
        
        return query.offset(offset).limit(limit).all()
    
    def find_recent_by_project(
        self,
        project_id: int,
        alert_type: str,
        seconds: int = 5
    ) -> List[Alert]:
        """Find recently created alerts"""
        cutoff = datetime.utcnow() - timedelta(seconds=seconds)
        return (
            self.db.query(Alert)
            .filter(
                and_(
                    Alert.project_id == project_id,
                    Alert.alert_type == alert_type,
                    Alert.created_at >= cutoff
                )
            )
            .all()
        )
