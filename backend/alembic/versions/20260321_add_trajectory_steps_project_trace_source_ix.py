"""Add composite index on trajectory_steps for snapshot-scoped timeline queries (§11.8).

Revision ID: 20260321_traj_pr_tr_src (must fit alembic_version VARCHAR(32))
Revises: 20260317_snapshot_soft_delete
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260321_traj_pr_tr_src"
down_revision = "20260317_snapshot_soft_delete"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_trajectory_steps_project_trace_source"


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("trajectory_steps"):
        return
    existing = {i.get("name") for i in insp.get_indexes("trajectory_steps") if i.get("name")}
    if INDEX_NAME in existing:
        return
    op.create_index(
        INDEX_NAME,
        "trajectory_steps",
        ["project_id", "trace_id", "source_id"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("trajectory_steps"):
        return
    existing = {i.get("name") for i in insp.get_indexes("trajectory_steps") if i.get("name")}
    if INDEX_NAME not in existing:
        return
    op.drop_index(INDEX_NAME, table_name="trajectory_steps")
