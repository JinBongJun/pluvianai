"""Add release_gate_jobs for async Release Gate runs.

Revision ID: 20260310_release_gate_jobs
Revises: 20260304_saved_logs
Create Date: 2026-03-10
"""

from alembic import op
import sqlalchemy as sa


revision = "20260310_release_gate_jobs"
down_revision = "20260304_saved_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("release_gate_jobs"):
        op.create_table(
            "release_gate_jobs",
            sa.Column("id", sa.String(length=255), primary_key=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("progress_done", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("progress_total", sa.Integer(), nullable=True),
            sa.Column("progress_phase", sa.String(length=50), nullable=True),
            sa.Column("request_json", sa.JSON(), nullable=False),
            sa.Column("report_id", sa.String(length=255), nullable=True),
            sa.Column("result_json", sa.JSON(), nullable=True),
            sa.Column("error_detail", sa.JSON(), nullable=True),
            sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("locked_by", sa.String(length=255), nullable=True),
            sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        )

    indexes = {idx["name"] for idx in inspector.get_indexes("release_gate_jobs")}
    if "ix_release_gate_jobs_project_id" not in indexes:
        op.create_index("ix_release_gate_jobs_project_id", "release_gate_jobs", ["project_id"], unique=False)
    if "ix_release_gate_jobs_user_id" not in indexes:
        op.create_index("ix_release_gate_jobs_user_id", "release_gate_jobs", ["user_id"], unique=False)
    if "ix_release_gate_jobs_status" not in indexes:
        op.create_index("ix_release_gate_jobs_status", "release_gate_jobs", ["status"], unique=False)
    if "ix_release_gate_jobs_report_id" not in indexes:
        op.create_index("ix_release_gate_jobs_report_id", "release_gate_jobs", ["report_id"], unique=False)
    if "ix_release_gate_jobs_created_at" not in indexes:
        op.create_index("ix_release_gate_jobs_created_at", "release_gate_jobs", ["created_at"], unique=False)
    if "ix_release_gate_jobs_updated_at" not in indexes:
        op.create_index("ix_release_gate_jobs_updated_at", "release_gate_jobs", ["updated_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("release_gate_jobs"):
        return

    indexes = {idx["name"] for idx in inspector.get_indexes("release_gate_jobs")}
    if "ix_release_gate_jobs_updated_at" in indexes:
        op.drop_index("ix_release_gate_jobs_updated_at", table_name="release_gate_jobs")
    if "ix_release_gate_jobs_created_at" in indexes:
        op.drop_index("ix_release_gate_jobs_created_at", table_name="release_gate_jobs")
    if "ix_release_gate_jobs_report_id" in indexes:
        op.drop_index("ix_release_gate_jobs_report_id", table_name="release_gate_jobs")
    if "ix_release_gate_jobs_status" in indexes:
        op.drop_index("ix_release_gate_jobs_status", table_name="release_gate_jobs")
    if "ix_release_gate_jobs_user_id" in indexes:
        op.drop_index("ix_release_gate_jobs_user_id", table_name="release_gate_jobs")
    if "ix_release_gate_jobs_project_id" in indexes:
        op.drop_index("ix_release_gate_jobs_project_id", table_name="release_gate_jobs")

    op.drop_table("release_gate_jobs")

