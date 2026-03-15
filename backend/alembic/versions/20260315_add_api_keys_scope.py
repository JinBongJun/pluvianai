"""Add scope to api_keys for API key permission scoping.

Revision ID: 20260315_api_keys_scope
Revises: 20260315_agent_setting_scope_uq
Create Date: 2026-03-15

"""

from alembic import op
import sqlalchemy as sa


revision = "20260315_api_keys_scope"
down_revision = "20260315_agent_setting_scope_uq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("api_keys"):
        return
    columns = {c["name"] for c in inspector.get_columns("api_keys")}
    if "scope" not in columns:
        op.add_column("api_keys", sa.Column("scope", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("api_keys"):
        return
    columns = {c["name"] for c in inspector.get_columns("api_keys")}
    if "scope" in columns:
        op.drop_column("api_keys", "scope")
