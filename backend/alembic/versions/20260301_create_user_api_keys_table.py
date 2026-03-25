"""Create user_api_keys (no historical create_table; breaks empty-DB CI).

Revision ID: 20260301_user_api_keys
Revises: add_eval_config_version
Create Date: 2026-03-01

"""
from alembic import op
import sqlalchemy as sa


revision = "20260301_user_api_keys"
down_revision = "add_eval_config_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("user_api_keys"):
        return

    op.create_table(
        "user_api_keys",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_user_api_keys_project_id", "user_api_keys", ["project_id"], unique=False)
    op.create_index("ix_user_api_keys_user_id", "user_api_keys", ["user_id"], unique=False)
    op.create_index("ix_user_api_keys_provider", "user_api_keys", ["provider"], unique=False)
    op.create_index("ix_user_api_keys_created_at", "user_api_keys", ["created_at"], unique=False)
    op.create_index(
        "idx_user_api_key_project_provider",
        "user_api_keys",
        ["project_id", "provider"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_user_api_key_project_provider", table_name="user_api_keys")
    op.drop_index("ix_user_api_keys_created_at", table_name="user_api_keys")
    op.drop_index("ix_user_api_keys_provider", table_name="user_api_keys")
    op.drop_index("ix_user_api_keys_user_id", table_name="user_api_keys")
    op.drop_index("ix_user_api_keys_project_id", table_name="user_api_keys")
    op.drop_table("user_api_keys")
