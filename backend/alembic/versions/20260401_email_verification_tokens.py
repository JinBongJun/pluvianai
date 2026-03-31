"""add email verification tokens and user verification flag

Revision ID: 20260401_email_verify
Revises: 20260331_merge_heads
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_email_verify"
down_revision = "20260331_merge_heads"
branch_labels = None
depends_on = None


def _has_column(insp: sa.Inspector, table_name: str, column_name: str) -> bool:
    return column_name in {c["name"] for c in insp.get_columns(table_name)}


def _has_index(insp: sa.Inspector, table_name: str, index_name: str) -> bool:
    return index_name in {i["name"] for i in insp.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("users") and not _has_column(insp, "users", "is_email_verified"):
        with op.batch_alter_table("users") as batch:
            batch.add_column(
                sa.Column("is_email_verified", sa.Boolean(), nullable=False, server_default=sa.true())
            )

    if not insp.has_table("email_verification_tokens"):
        op.create_table(
            "email_verification_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("token", sa.String(length=255), nullable=False),
            sa.Column("purpose", sa.String(length=32), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_email_verification_tokens_id", "email_verification_tokens", ["id"], unique=False)
        op.create_index(
            "ix_email_verification_tokens_user_id", "email_verification_tokens", ["user_id"], unique=False
        )
        op.create_index("ix_email_verification_tokens_email", "email_verification_tokens", ["email"], unique=False)
        op.create_index(
            "ix_email_verification_tokens_token", "email_verification_tokens", ["token"], unique=True
        )
        op.create_index(
            "ix_email_verification_tokens_purpose", "email_verification_tokens", ["purpose"], unique=False
        )
        op.create_index(
            "ix_email_verification_tokens_expires_at",
            "email_verification_tokens",
            ["expires_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("email_verification_tokens"):
        for index_name in (
            "ix_email_verification_tokens_expires_at",
            "ix_email_verification_tokens_purpose",
            "ix_email_verification_tokens_token",
            "ix_email_verification_tokens_email",
            "ix_email_verification_tokens_user_id",
            "ix_email_verification_tokens_id",
        ):
            if _has_index(insp, "email_verification_tokens", index_name):
                op.drop_index(index_name, table_name="email_verification_tokens")
        op.drop_table("email_verification_tokens")

    insp = sa.inspect(bind)
    if insp.has_table("users") and _has_column(insp, "users", "is_email_verified"):
        with op.batch_alter_table("users") as batch:
            batch.drop_column("is_email_verified")
