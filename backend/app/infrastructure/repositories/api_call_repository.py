from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from app.models.api_call import APICall
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository

class APICallRepository(SQLAlchemyRepository[APICall]):
    """API Call repository with domain-specific queries"""
    
    def __init__(self, db: Session):
        super().__init__(db, APICall)
    
    def find_by_project_id(
        self,
        project_id: int,
        limit: int = 100,
        offset: int = 0,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        agent_name: Optional[str] = None
    ) -> List[APICall]:
        """Find API calls by project with filters"""
        query = self.db.query(APICall).filter(APICall.project_id == project_id)
        
        if provider:
            query = query.filter(APICall.provider == provider)
        if model:
            query = query.filter(APICall.model == model)
        if agent_name:
            query = query.filter(APICall.agent_name == agent_name)
        
        return query.order_by(desc(APICall.created_at)).offset(offset).limit(limit).all()
    
    def count_by_project_id(self, project_id: int) -> int:
        """Count API calls for project"""
        return self.db.query(APICall).filter(APICall.project_id == project_id).count()
