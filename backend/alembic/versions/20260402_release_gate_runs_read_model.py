"""Add release_gate_runs read model.

Revision ID: 20260402_release_gate_runs
Revises: 20260401_usage_ledger
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_release_gate_runs"
down_revision = "20260401_usage_ledger"
branch_labels = None
depends_on = None


def _index_names(bind, table_name: str) -> set[str]:
    return {idx["name"] for idx in sa.inspect(bind).get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("release_gate_runs"):
        op.create_table(
            "release_gate_runs",
            sa.Column("id", sa.String(length=255), nullable=False),
            sa.Column("report_id", sa.String(length=255), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("trace_id", sa.String(length=255), nullable=True),
            sa.Column("baseline_trace_id", sa.String(length=255), nullable=True),
            sa.Column("agent_id", sa.String(length=100), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("mode", sa.String(length=50), nullable=False, server_default="replay_test"),
            sa.Column("repeat_runs", sa.Integer(), nullable=True),
            sa.Column("total_inputs", sa.Integer(), nullable=True),
            sa.Column("passed_runs", sa.Integer(), nullable=True),
            sa.Column("failed_runs", sa.Integer(), nullable=True),
            sa.Column("passed_attempts", sa.Integer(), nullable=True),
            sa.Column("total_attempts", sa.Integer(), nullable=True),
            sa.Column("thresholds_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["report_id"], ["behavior_reports.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    indexes = _index_names(bind, "release_gate_runs")
    for index_name, column_names, unique in (
        ("ix_release_gate_runs_report_id", ["report_id"], True),
        ("ix_release_gate_runs_project_id", ["project_id"], False),
        ("ix_release_gate_runs_trace_id", ["trace_id"], False),
        ("ix_release_gate_runs_agent_id", ["agent_id"], False),
        ("ix_release_gate_runs_status", ["status"], False),
        ("ix_release_gate_runs_created_at", ["created_at"], False),
        ("ix_release_gate_runs_id", ["id"], False),
    ):
        if index_name not in indexes:
            op.create_index(index_name, "release_gate_runs", column_names, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("release_gate_runs"):
        return

    for index_name in (
        "ix_release_gate_runs_id",
        "ix_release_gate_runs_created_at",
        "ix_release_gate_runs_status",
        "ix_release_gate_runs_agent_id",
        "ix_release_gate_runs_trace_id",
        "ix_release_gate_runs_project_id",
        "ix_release_gate_runs_report_id",
    ):
        op.drop_index(index_name, table_name="release_gate_runs")
    op.drop_table("release_gate_runs")
