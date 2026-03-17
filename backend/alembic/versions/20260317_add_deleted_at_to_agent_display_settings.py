"""Add deleted_at to agent_display_settings.

Revision ID: 20260317_agent_deleted_at
Revises: 20260315_agent_setting_scope_uq
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa


revision = "20260317_agent_deleted_at"
down_revision = "20260315_agent_setting_scope_uq"
branch_labels = None
depends_on = None


def _columns(bind) -> set[str]:
    inspector = sa.inspect(bind)
    if not inspector.has_table("agent_display_settings"):
        return set()
    return {c.get("name") for c in inspector.get_columns("agent_display_settings") if c.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _columns(bind)
    if "deleted_at" not in columns:
        with op.batch_alter_table("agent_display_settings") as batch_op:
            batch_op.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = _columns(bind)
    if "deleted_at" in columns:
        with op.batch_alter_table("agent_display_settings") as batch_op:
            batch_op.drop_column("deleted_at")
