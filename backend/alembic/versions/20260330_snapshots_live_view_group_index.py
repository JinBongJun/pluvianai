"""Partial index for Live View snapshot aggregation (active rows per project).

Revision ID: 20260330_snapshots_lv_ix
Revises: 20260330_sub_period_start
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa

revision = "20260330_snapshots_lv_ix"
down_revision = "20260330_sub_period_start"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_snapshots_live_view_active_group"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    insp = sa.inspect(bind)
    if not insp.has_table("snapshots"):
        return
    existing = {i["name"] for i in insp.get_indexes("snapshots")}
    if INDEX_NAME in existing:
        return
    op.execute(
        sa.text(
            f"CREATE INDEX {INDEX_NAME} ON snapshots "
            "(project_id, agent_id, model) WHERE is_deleted IS FALSE"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    insp = sa.inspect(bind)
    if not insp.has_table("snapshots"):
        return
    existing = {i["name"] for i in insp.get_indexes("snapshots")}
    if INDEX_NAME not in existing:
        return
    op.drop_index(INDEX_NAME, table_name="snapshots")
