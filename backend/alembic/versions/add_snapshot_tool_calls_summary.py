"""Add tool_calls_summary to snapshots.

Revision ID: add_tool_calls_summary
Revises: add_eval_checks_result
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa


revision = "add_tool_calls_summary"
down_revision = "add_eval_checks_result"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "snapshots",
        sa.Column("tool_calls_summary", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("snapshots", "tool_calls_summary")
