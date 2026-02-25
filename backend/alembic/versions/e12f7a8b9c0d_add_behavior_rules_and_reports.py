"""add_behavior_rules_and_reports

Revision ID: e12f7a8b9c0d
Revises: 67fc79a64a2d
Create Date: 2026-02-17 22:10:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e12f7a8b9c0d"
down_revision = "67fc79a64a2d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "behavior_rules",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("scope_type", sa.String(length=30), server_default="project", nullable=False),
        sa.Column("scope_ref", sa.String(length=255), nullable=True),
        sa.Column("severity_default", sa.String(length=20), nullable=True),
        sa.Column("rule_json", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_behavior_rules_id"), "behavior_rules", ["id"], unique=False)
    op.create_index(op.f("ix_behavior_rules_project_id"), "behavior_rules", ["project_id"], unique=False)
    op.create_index(op.f("ix_behavior_rules_enabled"), "behavior_rules", ["enabled"], unique=False)
    op.create_index(op.f("ix_behavior_rules_created_at"), "behavior_rules", ["created_at"], unique=False)

    op.create_table(
        "behavior_reports",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("trace_id", sa.String(length=255), nullable=True),
        sa.Column("test_run_id", sa.String(length=255), nullable=True),
        sa.Column("baseline_report_id", sa.String(length=255), nullable=True),
        sa.Column("baseline_run_ref", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("summary_json", sa.JSON(), nullable=False),
        sa.Column("violations_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["test_run_id"], ["test_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_behavior_reports_id"), "behavior_reports", ["id"], unique=False)
    op.create_index(op.f("ix_behavior_reports_project_id"), "behavior_reports", ["project_id"], unique=False)
    op.create_index(op.f("ix_behavior_reports_trace_id"), "behavior_reports", ["trace_id"], unique=False)
    op.create_index(op.f("ix_behavior_reports_test_run_id"), "behavior_reports", ["test_run_id"], unique=False)
    op.create_index(op.f("ix_behavior_reports_baseline_report_id"), "behavior_reports", ["baseline_report_id"], unique=False)
    op.create_index(op.f("ix_behavior_reports_status"), "behavior_reports", ["status"], unique=False)
    op.create_index(op.f("ix_behavior_reports_created_at"), "behavior_reports", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_behavior_reports_created_at"), table_name="behavior_reports")
    op.drop_index(op.f("ix_behavior_reports_status"), table_name="behavior_reports")
    op.drop_index(op.f("ix_behavior_reports_baseline_report_id"), table_name="behavior_reports")
    op.drop_index(op.f("ix_behavior_reports_test_run_id"), table_name="behavior_reports")
    op.drop_index(op.f("ix_behavior_reports_trace_id"), table_name="behavior_reports")
    op.drop_index(op.f("ix_behavior_reports_project_id"), table_name="behavior_reports")
    op.drop_index(op.f("ix_behavior_reports_id"), table_name="behavior_reports")
    op.drop_table("behavior_reports")

    op.drop_index(op.f("ix_behavior_rules_created_at"), table_name="behavior_rules")
    op.drop_index(op.f("ix_behavior_rules_enabled"), table_name="behavior_rules")
    op.drop_index(op.f("ix_behavior_rules_project_id"), table_name="behavior_rules")
    op.drop_index(op.f("ix_behavior_rules_id"), table_name="behavior_rules")
    op.drop_table("behavior_rules")

