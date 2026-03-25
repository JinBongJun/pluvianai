"""Add soft-delete fields to organizations and projects.

Revision ID: 20260309_soft_delete_org_project
Revises: 20260310_rg_cancel_req
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa


revision = "20260309_soft_delete_org_project"
down_revision = "20260310_rg_cancel_req"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("projects"):
        project_columns = {col["name"] for col in inspector.get_columns("projects")}
        if "is_deleted" not in project_columns:
            op.add_column(
                "projects",
                sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )
        if "deleted_at" not in project_columns:
            op.add_column(
                "projects",
                sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            )

    if inspector.has_table("organizations"):
        org_columns = {col["name"] for col in inspector.get_columns("organizations")}
        if "is_deleted" not in org_columns:
            op.add_column(
                "organizations",
                sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )
        if "deleted_at" not in org_columns:
            op.add_column(
                "organizations",
                sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("organizations"):
        org_columns = {col["name"] for col in inspector.get_columns("organizations")}
        if "deleted_at" in org_columns:
            op.drop_column("organizations", "deleted_at")
        if "is_deleted" in org_columns:
            op.drop_column("organizations", "is_deleted")

    if inspector.has_table("projects"):
        project_columns = {col["name"] for col in inspector.get_columns("projects")}
        if "deleted_at" in project_columns:
            op.drop_column("projects", "deleted_at")
        if "is_deleted" in project_columns:
            op.drop_column("projects", "is_deleted")

