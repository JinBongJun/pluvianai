"""Add cancel_requested_at to release_gate_jobs.

Revision ID: 20260310_rg_cancel_req
Revises: 20260310_release_gate_jobs
Create Date: 2026-03-10
"""

from alembic import op
import sqlalchemy as sa


revision = "20260310_rg_cancel_req"
down_revision = "20260310_release_gate_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("release_gate_jobs"):
        return

    cols = {c["name"] for c in inspector.get_columns("release_gate_jobs")}
    if "cancel_requested_at" not in cols:
        op.add_column(
            "release_gate_jobs",
            sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("release_gate_jobs"):
        return

    cols = {c["name"] for c in inspector.get_columns("release_gate_jobs")}
    if "cancel_requested_at" in cols:
        op.drop_column("release_gate_jobs", "cancel_requested_at")

