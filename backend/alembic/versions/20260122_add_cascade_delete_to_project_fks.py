"""add cascade delete to project foreign keys

Revision ID: add_cascade_delete_20260122
Revises: add_organizations_20260121
Create Date: 2026-01-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_cascade_delete_20260122"
down_revision: Union[str, None] = "add_organizations_20260121"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _refresh_project_fk(table: str, constraint_name: str) -> None:
    """Re-create project_id FK with ON DELETE CASCADE if the table exists (legacy DBs only)."""
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(table):
        return
    op.drop_constraint(constraint_name, table, type_="foreignkey")
    op.create_foreign_key(
        constraint_name,
        table,
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )


def _revert_project_fk(table: str, constraint_name: str) -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(table):
        return
    op.drop_constraint(constraint_name, table, type_="foreignkey")
    op.create_foreign_key(
        constraint_name,
        table,
        "projects",
        ["project_id"],
        ["id"],
    )


def upgrade() -> None:
    """
    Add ON DELETE CASCADE to all foreign keys referencing projects.id
    This ensures that when a project is deleted, all related data is automatically deleted.
    """
    # Empty databases bootstrapped via Alembic may not have legacy app tables yet; skip missing tables.
    _refresh_project_fk("api_calls", "api_calls_project_id_fkey")
    _refresh_project_fk("quality_scores", "quality_scores_project_id_fkey")
    _refresh_project_fk("alerts", "alerts_project_id_fkey")
    _refresh_project_fk("drift_detections", "drift_detections_project_id_fkey")
    _refresh_project_fk("shadow_comparisons", "shadow_comparisons_project_id_fkey")
    _refresh_project_fk("usage", "usage_project_id_fkey")
    _refresh_project_fk("webhooks", "webhooks_project_id_fkey")
    _refresh_project_fk("activity_logs", "activity_logs_project_id_fkey")
    _refresh_project_fk("project_members", "project_members_project_id_fkey")


def downgrade() -> None:
    """Remove CASCADE from foreign keys (revert to RESTRICT/SET NULL behavior)."""
    _revert_project_fk("api_calls", "api_calls_project_id_fkey")
    _revert_project_fk("quality_scores", "quality_scores_project_id_fkey")
    _revert_project_fk("alerts", "alerts_project_id_fkey")
    _revert_project_fk("drift_detections", "drift_detections_project_id_fkey")
    _revert_project_fk("shadow_comparisons", "shadow_comparisons_project_id_fkey")
    _revert_project_fk("usage", "usage_project_id_fkey")
    _revert_project_fk("webhooks", "webhooks_project_id_fkey")
    _revert_project_fk("activity_logs", "activity_logs_project_id_fkey")
    _revert_project_fk("project_members", "project_members_project_id_fkey")
