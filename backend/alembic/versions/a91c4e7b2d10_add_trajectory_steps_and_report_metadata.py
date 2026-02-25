"""add_trajectory_steps_and_report_metadata

Revision ID: a91c4e7b2d10
Revises: f34a9c1d2e7b
Create Date: 2026-02-18 11:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a91c4e7b2d10"
down_revision = "f34a9c1d2e7b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("behavior_reports", sa.Column("agent_id", sa.String(length=100), nullable=True))
    op.add_column("behavior_reports", sa.Column("ruleset_hash", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_behavior_reports_agent_id"), "behavior_reports", ["agent_id"], unique=False)
    op.create_index(op.f("ix_behavior_reports_ruleset_hash"), "behavior_reports", ["ruleset_hash"], unique=False)

    op.create_table(
        "trajectory_steps",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("trace_id", sa.String(length=255), nullable=True),
        sa.Column("test_run_id", sa.String(length=255), nullable=True),
        sa.Column("step_order", sa.Float(), nullable=False),
        sa.Column("parent_step_id", sa.String(length=255), nullable=True),
        sa.Column("is_parallel", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("step_type", sa.String(length=30), nullable=False),
        sa.Column("agent_id", sa.String(length=100), nullable=True),
        sa.Column("tool_name", sa.String(length=255), nullable=True),
        sa.Column("tool_args", sa.JSON(), nullable=True),
        sa.Column("tool_result", sa.JSON(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("source_type", sa.String(length=50), nullable=True),
        sa.Column("source_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["test_run_id"], ["test_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trajectory_steps_id"), "trajectory_steps", ["id"], unique=False)
    op.create_index(op.f("ix_trajectory_steps_project_id"), "trajectory_steps", ["project_id"], unique=False)
    op.create_index(op.f("ix_trajectory_steps_trace_id"), "trajectory_steps", ["trace_id"], unique=False)
    op.create_index(op.f("ix_trajectory_steps_test_run_id"), "trajectory_steps", ["test_run_id"], unique=False)
    op.create_index(op.f("ix_trajectory_steps_step_order"), "trajectory_steps", ["step_order"], unique=False)
    op.create_index(op.f("ix_trajectory_steps_step_type"), "trajectory_steps", ["step_type"], unique=False)
    op.create_index(op.f("ix_trajectory_steps_agent_id"), "trajectory_steps", ["agent_id"], unique=False)
    op.create_index(op.f("ix_trajectory_steps_tool_name"), "trajectory_steps", ["tool_name"], unique=False)
    op.create_index(op.f("ix_trajectory_steps_created_at"), "trajectory_steps", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_trajectory_steps_created_at"), table_name="trajectory_steps")
    op.drop_index(op.f("ix_trajectory_steps_tool_name"), table_name="trajectory_steps")
    op.drop_index(op.f("ix_trajectory_steps_agent_id"), table_name="trajectory_steps")
    op.drop_index(op.f("ix_trajectory_steps_step_type"), table_name="trajectory_steps")
    op.drop_index(op.f("ix_trajectory_steps_step_order"), table_name="trajectory_steps")
    op.drop_index(op.f("ix_trajectory_steps_test_run_id"), table_name="trajectory_steps")
    op.drop_index(op.f("ix_trajectory_steps_trace_id"), table_name="trajectory_steps")
    op.drop_index(op.f("ix_trajectory_steps_project_id"), table_name="trajectory_steps")
    op.drop_index(op.f("ix_trajectory_steps_id"), table_name="trajectory_steps")
    op.drop_table("trajectory_steps")

    op.drop_index(op.f("ix_behavior_reports_ruleset_hash"), table_name="behavior_reports")
    op.drop_index(op.f("ix_behavior_reports_agent_id"), table_name="behavior_reports")
    op.drop_column("behavior_reports", "ruleset_hash")
    op.drop_column("behavior_reports", "agent_id")
