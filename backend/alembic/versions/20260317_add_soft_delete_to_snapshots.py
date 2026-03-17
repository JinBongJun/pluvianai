"""Add soft delete columns to snapshots.

Revision ID: 20260317_snapshot_soft_delete
Revises: efeaf96c4b84
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa


revision = "20260317_snapshot_soft_delete"
down_revision = "efeaf96c4b84"
branch_labels = None
depends_on = None


def _columns(bind) -> set[str]:
    inspector = sa.inspect(bind)
    if not inspector.has_table("snapshots"):
        return set()
    return {c.get("name") for c in inspector.get_columns("snapshots") if c.get("name")}


def _indexes(bind) -> set[str]:
    inspector = sa.inspect(bind)
    if not inspector.has_table("snapshots"):
        return set()
    return {i.get("name") for i in inspector.get_indexes("snapshots") if i.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _columns(bind)
    indexes = _indexes(bind)

    with op.batch_alter_table("snapshots") as batch_op:
        if "is_deleted" not in columns:
            batch_op.add_column(
                sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false"))
            )
        if "deleted_at" not in columns:
            batch_op.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        if "ix_snapshots_is_deleted" not in indexes:
            batch_op.create_index("ix_snapshots_is_deleted", ["is_deleted"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    columns = _columns(bind)
    indexes = _indexes(bind)

    with op.batch_alter_table("snapshots") as batch_op:
        if "ix_snapshots_is_deleted" in indexes:
            batch_op.drop_index("ix_snapshots_is_deleted")
        if "deleted_at" in columns:
            batch_op.drop_column("deleted_at")
        if "is_deleted" in columns:
            batch_op.drop_column("is_deleted")
