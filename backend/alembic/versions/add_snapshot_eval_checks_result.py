"""Add eval_checks_result to snapshots for stable Live View eval display.

Revision ID: add_eval_checks_result
Revises: merge_vd_eval
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa


revision = "add_eval_checks_result"
down_revision = "merge_vd_eval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "snapshots",
        sa.Column("eval_checks_result", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("snapshots", "eval_checks_result")
