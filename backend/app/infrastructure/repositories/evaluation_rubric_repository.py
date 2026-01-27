from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.evaluation_rubric import EvaluationRubric
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository


class EvaluationRubricRepository(SQLAlchemyRepository[EvaluationRubric]):
    """EvaluationRubric repository with domain-specific queries"""

    def __init__(self, db: Session):
        super().__init__(db, EvaluationRubric)

    def find_by_project_id(self, project_id: int, active_only: bool = True) -> List[EvaluationRubric]:
        """Find all rubrics for a project"""
        query = self.db.query(EvaluationRubric).filter(EvaluationRubric.project_id == project_id)
        if active_only:
            query = query.filter(EvaluationRubric.is_active.is_(True))
        return query.order_by(EvaluationRubric.created_at.desc()).all()

    def find_by_name_and_project(
        self, name: str, project_id: int
    ) -> Optional[EvaluationRubric]:
        """Find rubric by name and project"""
        return (
            self.db.query(EvaluationRubric)
            .filter(
                and_(
                    EvaluationRubric.name == name,
                    EvaluationRubric.project_id == project_id
                )
            )
            .first()
        )

    def find_active_by_project_id(self, project_id: int) -> List[EvaluationRubric]:
        """Find active rubrics for a project"""
        return (
            self.db.query(EvaluationRubric)
            .filter(
                and_(
                    EvaluationRubric.project_id == project_id,
                    EvaluationRubric.is_active.is_(True)
                )
            )
            .order_by(EvaluationRubric.created_at.desc())
            .all()
        )

    def count_by_project_id(self, project_id: int) -> int:
        """Count rubrics for a project"""
        return (
            self.db.query(EvaluationRubric)
            .filter(EvaluationRubric.project_id == project_id)
            .count()
        )
