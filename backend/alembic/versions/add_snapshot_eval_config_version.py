"""Add eval_config_version to snapshots.

Revision ID: add_eval_config_version
Revises: add_tool_calls_summary
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa


revision = "add_eval_config_version"
down_revision = "add_tool_calls_summary"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "snapshots",
        sa.Column("eval_config_version", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("snapshots", "eval_config_version")
