"""Add saved_logs table for node-scoped log bookmarks.

Revision ID: 20260304_saved_logs
Revises: 20260302uak
Create Date: 2026-03-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20260304_saved_logs"
down_revision = "20260302uak"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("saved_logs"):
        op.create_table(
            "saved_logs",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("agent_id", sa.String(length=100), nullable=False),
            sa.Column("snapshot_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["snapshot_id"], ["snapshots.id"], ondelete="CASCADE"),
            sa.UniqueConstraint(
                "project_id",
                "agent_id",
                "snapshot_id",
                name="uq_saved_logs_project_agent_snapshot",
            ),
        )

    indexes = {idx["name"] for idx in inspector.get_indexes("saved_logs")}
    if "ix_saved_logs_project_id" not in indexes:
        op.create_index("ix_saved_logs_project_id", "saved_logs", ["project_id"], unique=False)
    if "ix_saved_logs_agent_id" not in indexes:
        op.create_index("ix_saved_logs_agent_id", "saved_logs", ["agent_id"], unique=False)
    if "ix_saved_logs_snapshot_id" not in indexes:
        op.create_index("ix_saved_logs_snapshot_id", "saved_logs", ["snapshot_id"], unique=False)
    if "ix_saved_logs_created_at" not in indexes:
        op.create_index("ix_saved_logs_created_at", "saved_logs", ["created_at"], unique=False)
    if "idx_saved_logs_project_agent_created" not in indexes:
        op.create_index(
            "idx_saved_logs_project_agent_created",
            "saved_logs",
            ["project_id", "agent_id", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("saved_logs"):
        return

    indexes = {idx["name"] for idx in inspector.get_indexes("saved_logs")}
    if "idx_saved_logs_project_agent_created" in indexes:
        op.drop_index("idx_saved_logs_project_agent_created", table_name="saved_logs")
    if "ix_saved_logs_created_at" in indexes:
        op.drop_index("ix_saved_logs_created_at", table_name="saved_logs")
    if "ix_saved_logs_snapshot_id" in indexes:
        op.drop_index("ix_saved_logs_snapshot_id", table_name="saved_logs")
    if "ix_saved_logs_agent_id" in indexes:
        op.drop_index("ix_saved_logs_agent_id", table_name="saved_logs")
    if "ix_saved_logs_project_id" in indexes:
        op.drop_index("ix_saved_logs_project_id", table_name="saved_logs")

    op.drop_table("saved_logs")
