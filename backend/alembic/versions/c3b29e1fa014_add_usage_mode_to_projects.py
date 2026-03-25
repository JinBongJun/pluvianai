"""add_usage_mode_to_projects

Revision ID: c3b29e1fa014
Revises: 68938300b4e3
Create Date: 2026-02-15 21:38:05.485204

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c3b29e1fa014'
down_revision = '68938300b4e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 20260206_usage_mode on the merged branch may have added this already.
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("projects")}
    if "usage_mode" not in cols:
        op.add_column(
            "projects",
            sa.Column("usage_mode", sa.String(length=32), nullable=False, server_default="full"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("projects")}
    if "usage_mode" in cols:
        op.drop_column("projects", "usage_mode")
