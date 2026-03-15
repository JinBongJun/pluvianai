"""Add key_hint to user_api_keys for masked display in UI.

Revision ID: 20260315_key_hint
Revises: 20260309_soft_delete_org_project
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa


revision = "20260315_key_hint"
down_revision = "20260309_soft_delete_org_project"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("user_api_keys")}
    if "key_hint" not in columns:
        op.add_column(
            "user_api_keys",
            sa.Column("key_hint", sa.String(length=32), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("user_api_keys")}
    if "key_hint" in columns:
        op.drop_column("user_api_keys", "key_hint")
