"""Add optional agent scope to user_api_keys.

Revision ID: 20260302uak
Revises: 20260301_user_api_keys
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260302uak"
down_revision = "20260301_user_api_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {col["name"] for col in inspector.get_columns("user_api_keys")}
    if "agent_id" not in columns:
        op.add_column("user_api_keys", sa.Column("agent_id", sa.String(length=255), nullable=True))

    indexes = {idx["name"] for idx in inspector.get_indexes("user_api_keys")}
    if "ix_user_api_keys_agent_id" not in indexes:
        op.create_index("ix_user_api_keys_agent_id", "user_api_keys", ["agent_id"], unique=False)
    if "idx_user_api_key_project_provider_agent" not in indexes:
        op.create_index(
            "idx_user_api_key_project_provider_agent",
            "user_api_keys",
            ["project_id", "provider", "agent_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {idx["name"] for idx in inspector.get_indexes("user_api_keys")}
    if "idx_user_api_key_project_provider_agent" in indexes:
        op.drop_index("idx_user_api_key_project_provider_agent", table_name="user_api_keys")
    if "ix_user_api_keys_agent_id" in indexes:
        op.drop_index("ix_user_api_keys_agent_id", table_name="user_api_keys")

    columns = {col["name"] for col in inspector.get_columns("user_api_keys")}
    if "agent_id" in columns:
        op.drop_column("user_api_keys", "agent_id")
