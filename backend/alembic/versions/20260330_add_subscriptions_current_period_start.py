"""Add subscriptions.current_period_start if missing (ORM parity).

Revision ID: 20260330_sub_period_start
Revises: 20260329_ci_fresh_db_parity
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa

revision = "20260330_sub_period_start"
down_revision = "20260329_ci_fresh_db_parity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("subscriptions"):
        return
    cols = {c["name"] for c in insp.get_columns("subscriptions")}
    if "current_period_start" not in cols:
        op.add_column(
            "subscriptions",
            sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("subscriptions"):
        return
    cols = {c["name"] for c in insp.get_columns("subscriptions")}
    if "current_period_start" in cols:
        op.drop_column("subscriptions", "current_period_start")
