"""Merge validation_datasets and eval_config_history heads

Revision ID: merge_vd_eval
Revises: 20260217vd, add_eval_config_history
Create Date: 2026-02-17

"""

from alembic import op
import sqlalchemy as sa


revision = "merge_vd_eval"
down_revision = ("20260217vd", "add_eval_config_history")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
