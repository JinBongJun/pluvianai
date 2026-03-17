from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.snapshot import Snapshot
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository


class SnapshotRepository(SQLAlchemyRepository[Snapshot]):
    """Snapshot repository with domain-specific queries"""

    def __init__(self, db: Session):
        super().__init__(db, Snapshot)

    def find_by_trace_id(self, trace_id: str) -> List[Snapshot]:
        """Find all snapshots for a trace"""
        return (
            self.db.query(Snapshot)
            .filter(Snapshot.trace_id == trace_id, Snapshot.is_deleted.is_(False))
            .order_by(Snapshot.created_at.desc())
            .all()
        )

    def find_by_project_id(self, project_id: int, limit: int = 100, offset: int = 0) -> List[Snapshot]:
        """Find all snapshots for a project (via trace)"""
        from app.models.trace import Trace
        return (
            self.db.query(Snapshot)
            .join(Trace)
            .filter(Trace.project_id == project_id, Snapshot.is_deleted.is_(False))
            .order_by(Snapshot.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def find_by_provider_and_model(
        self, project_id: int, provider: str, model: str, limit: int = 100, offset: int = 0
    ) -> List[Snapshot]:
        """Find snapshots by provider and model for a project"""
        from app.models.trace import Trace
        return (
            self.db.query(Snapshot)
            .join(Trace)
            .filter(
                and_(
                    Trace.project_id == project_id,
                    Snapshot.provider == provider,
                    Snapshot.model == model,
                    Snapshot.is_deleted.is_(False),
                )
            )
            .order_by(Snapshot.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def count_by_project_id(self, project_id: int) -> int:
        """Count snapshots for a project"""
        from app.models.trace import Trace
        return (
            self.db.query(Snapshot)
            .join(Trace)
            .filter(Trace.project_id == project_id, Snapshot.is_deleted.is_(False))
            .count()
        )
