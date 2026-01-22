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


def upgrade() -> None:
    """
    Add ON DELETE CASCADE to all foreign keys referencing projects.id
    This ensures that when a project is deleted, all related data is automatically deleted.
    """
    
    # Drop and recreate foreign keys with CASCADE
    # Note: We need to drop the constraint first, then recreate it with CASCADE
    
    # api_calls
    op.drop_constraint("api_calls_project_id_fkey", "api_calls", type_="foreignkey")
    op.create_foreign_key(
        "api_calls_project_id_fkey",
        "api_calls", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )
    
    # quality_scores
    op.drop_constraint("quality_scores_project_id_fkey", "quality_scores", type_="foreignkey")
    op.create_foreign_key(
        "quality_scores_project_id_fkey",
        "quality_scores", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )
    
    # alerts
    op.drop_constraint("alerts_project_id_fkey", "alerts", type_="foreignkey")
    op.create_foreign_key(
        "alerts_project_id_fkey",
        "alerts", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )
    
    # drift_detections
    op.drop_constraint("drift_detections_project_id_fkey", "drift_detections", type_="foreignkey")
    op.create_foreign_key(
        "drift_detections_project_id_fkey",
        "drift_detections", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )
    
    # shadow_comparisons
    op.drop_constraint("shadow_comparisons_project_id_fkey", "shadow_comparisons", type_="foreignkey")
    op.create_foreign_key(
        "shadow_comparisons_project_id_fkey",
        "shadow_comparisons", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )
    
    # usage (nullable, but still cascade)
    op.drop_constraint("usage_project_id_fkey", "usage", type_="foreignkey")
    op.create_foreign_key(
        "usage_project_id_fkey",
        "usage", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )
    
    # webhooks (nullable, but still cascade)
    op.drop_constraint("webhooks_project_id_fkey", "webhooks", type_="foreignkey")
    op.create_foreign_key(
        "webhooks_project_id_fkey",
        "webhooks", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )
    
    # activity_logs (nullable, but still cascade)
    op.drop_constraint("activity_logs_project_id_fkey", "activity_logs", type_="foreignkey")
    op.create_foreign_key(
        "activity_logs_project_id_fkey",
        "activity_logs", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )
    
    # project_members already has CASCADE, but let's ensure it
    op.drop_constraint("project_members_project_id_fkey", "project_members", type_="foreignkey")
    op.create_foreign_key(
        "project_members_project_id_fkey",
        "project_members", "projects",
        ["project_id"], ["id"],
        ondelete="CASCADE"
    )


def downgrade() -> None:
    """
    Remove CASCADE from foreign keys (revert to RESTRICT/SET NULL behavior)
    """
    
    # Revert to original foreign keys without CASCADE
    # api_calls
    op.drop_constraint("api_calls_project_id_fkey", "api_calls", type_="foreignkey")
    op.create_foreign_key(
        "api_calls_project_id_fkey",
        "api_calls", "projects",
        ["project_id"], ["id"]
    )
    
    # quality_scores
    op.drop_constraint("quality_scores_project_id_fkey", "quality_scores", type_="foreignkey")
    op.create_foreign_key(
        "quality_scores_project_id_fkey",
        "quality_scores", "projects",
        ["project_id"], ["id"]
    )
    
    # alerts
    op.drop_constraint("alerts_project_id_fkey", "alerts", type_="foreignkey")
    op.create_foreign_key(
        "alerts_project_id_fkey",
        "alerts", "projects",
        ["project_id"], ["id"]
    )
    
    # drift_detections
    op.drop_constraint("drift_detections_project_id_fkey", "drift_detections", type_="foreignkey")
    op.create_foreign_key(
        "drift_detections_project_id_fkey",
        "drift_detections", "projects",
        ["project_id"], ["id"]
    )
    
    # shadow_comparisons
    op.drop_constraint("shadow_comparisons_project_id_fkey", "shadow_comparisons", type_="foreignkey")
    op.create_foreign_key(
        "shadow_comparisons_project_id_fkey",
        "shadow_comparisons", "projects",
        ["project_id"], ["id"]
    )
    
    # usage
    op.drop_constraint("usage_project_id_fkey", "usage", type_="foreignkey")
    op.create_foreign_key(
        "usage_project_id_fkey",
        "usage", "projects",
        ["project_id"], ["id"]
    )
    
    # webhooks
    op.drop_constraint("webhooks_project_id_fkey", "webhooks", type_="foreignkey")
    op.create_foreign_key(
        "webhooks_project_id_fkey",
        "webhooks", "projects",
        ["project_id"], ["id"]
    )
    
    # activity_logs
    op.drop_constraint("activity_logs_project_id_fkey", "activity_logs", type_="foreignkey")
    op.create_foreign_key(
        "activity_logs_project_id_fkey",
        "activity_logs", "projects",
        ["project_id"], ["id"]
    )
    
    # project_members
    op.drop_constraint("project_members_project_id_fkey", "project_members", type_="foreignkey")
    op.create_foreign_key(
        "project_members_project_id_fkey",
        "project_members", "projects",
        ["project_id"], ["id"]
    )
