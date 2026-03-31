"""add google auth fields to users

Revision ID: 20260401_google_auth
Revises: 20260401_email_verify
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_google_auth"
down_revision = "20260401_email_verify"
branch_labels = None
depends_on = None


def _has_column(insp: sa.Inspector, table_name: str, column_name: str) -> bool:
    return column_name in {c["name"] for c in insp.get_columns(table_name)}


def _has_index(insp: sa.Inspector, table_name: str, index_name: str) -> bool:
    return index_name in {i["name"] for i in insp.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("users"):
        with op.batch_alter_table("users") as batch:
            if not _has_column(insp, "users", "avatar_url"):
                batch.add_column(sa.Column("avatar_url", sa.String(length=2048), nullable=True))
            if not _has_column(insp, "users", "primary_auth_provider"):
                batch.add_column(
                    sa.Column(
                        "primary_auth_provider",
                        sa.String(length=32),
                        nullable=False,
                        server_default="password",
                    )
                )
            if not _has_column(insp, "users", "password_login_enabled"):
                batch.add_column(
                    sa.Column(
                        "password_login_enabled",
                        sa.Boolean(),
                        nullable=False,
                        server_default=sa.true(),
                    )
                )
            if not _has_column(insp, "users", "google_login_enabled"):
                batch.add_column(
                    sa.Column(
                        "google_login_enabled",
                        sa.Boolean(),
                        nullable=False,
                        server_default=sa.false(),
                    )
                )
            if not _has_column(insp, "users", "google_id"):
                batch.add_column(sa.Column("google_id", sa.String(length=255), nullable=True))

    insp = sa.inspect(bind)
    if insp.has_table("users") and not _has_index(insp, "users", "ix_users_google_id"):
        op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("users") and _has_index(insp, "users", "ix_users_google_id"):
        op.drop_index("ix_users_google_id", table_name="users")

    insp = sa.inspect(bind)
    if insp.has_table("users"):
        with op.batch_alter_table("users") as batch:
            if _has_column(insp, "users", "google_id"):
                batch.drop_column("google_id")
            if _has_column(insp, "users", "google_login_enabled"):
                batch.drop_column("google_login_enabled")
            if _has_column(insp, "users", "password_login_enabled"):
                batch.drop_column("password_login_enabled")
            if _has_column(insp, "users", "primary_auth_provider"):
                batch.drop_column("primary_auth_provider")
            if _has_column(insp, "users", "avatar_url"):
                batch.drop_column("avatar_url")
