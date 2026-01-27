from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.trace import Trace
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository


class TraceRepository(SQLAlchemyRepository[Trace]):
    """Trace repository with domain-specific queries"""

    def __init__(self, db: Session):
        super().__init__(db, Trace)

    def find_by_id(self, id: str) -> Optional[Trace]:
        """Find trace by string ID (UUID)"""
        return self.db.query(Trace).filter(Trace.id == id).first()

    def find_by_project_id(self, project_id: int, limit: int = 100, offset: int = 0) -> List[Trace]:
        """Find all traces for a project"""
        return (
            self.db.query(Trace)
            .filter(Trace.project_id == project_id)
            .order_by(Trace.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def find_or_create(self, trace_id: str, project_id: int) -> Trace:
        """Find existing trace or create new one"""
        trace = self.find_by_id(trace_id)
        if trace:
            return trace
        
        trace = Trace(id=trace_id, project_id=project_id)
        return self.save(trace)

    def count_by_project_id(self, project_id: int) -> int:
        """Count traces for a project"""
        return self.db.query(Trace).filter(Trace.project_id == project_id).count()
