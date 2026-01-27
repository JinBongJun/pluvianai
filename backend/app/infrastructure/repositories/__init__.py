"""Repository pattern implementations following OCP principle"""

from app.infrastructure.repositories.base import BaseRepository
from app.infrastructure.repositories.sqlalchemy_repository import SQLAlchemyRepository
from app.infrastructure.repositories.project_repository import ProjectRepository
from app.infrastructure.repositories.user_repository import UserRepository
from app.infrastructure.repositories.api_call_repository import APICallRepository
from app.infrastructure.repositories.alert_repository import AlertRepository
from app.infrastructure.repositories.organization_repository import OrganizationRepository
from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
from app.infrastructure.repositories.trace_repository import TraceRepository
from app.infrastructure.repositories.evaluation_rubric_repository import EvaluationRubricRepository
from app.infrastructure.repositories.organization_member_repository import OrganizationMemberRepository
from app.infrastructure.repositories.project_member_repository import ProjectMemberRepository
from app.infrastructure.repositories.exceptions import (
    RepositoryException,
    EntityNotFoundError,
    EntityAlreadyExistsError
)

__all__ = [
    "BaseRepository",
    "SQLAlchemyRepository",
    "ProjectRepository",
    "UserRepository",
    "APICallRepository",
    "AlertRepository",
    "OrganizationRepository",
    "SnapshotRepository",
    "TraceRepository",
    "EvaluationRubricRepository",
    "OrganizationMemberRepository",
    "ProjectMemberRepository",
    "RepositoryException",
    "EntityNotFoundError",
    "EntityAlreadyExistsError",
]
