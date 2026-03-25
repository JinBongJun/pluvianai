"""Bootstrap users + projects for fresh DBs (CI, empty Postgres).

Historically core tables were created outside Alembic; organizations and later
revisions assume they exist. This revision is the single graph root so
`alembic upgrade head` on an empty database succeeds.

Revision ID: 20260120_bootstrap (VARCHAR(32) alembic_version limit)
Revises: None
Create Date: 2026-01-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260120_bootstrap"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("hashed_password", sa.String(length=255), nullable=False),
            sa.Column("full_name", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=True),
            sa.Column("is_superuser", sa.Boolean(), server_default="false", nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("email", name="uq_users_email"),
        )
        op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
        op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    if not insp.has_table("projects"):
        op.create_table(
            "projects",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=True),
            # Present before 896063a36393 (alter JSONB → JSON); empty-DB upgrades need this column.
            sa.Column(
                "shadow_routing_config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index(op.f("ix_projects_id"), "projects", ["id"], unique=False)
        op.create_index(op.f("ix_projects_owner_id"), "projects", ["owner_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("projects"):
        op.drop_index(op.f("ix_projects_owner_id"), table_name="projects")
        op.drop_index(op.f("ix_projects_id"), table_name="projects")
        op.drop_table("projects")

    if insp.has_table("users"):
        op.drop_index(op.f("ix_users_email"), table_name="users")
        op.drop_index(op.f("ix_users_id"), table_name="users")
        op.drop_table("users")
