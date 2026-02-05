"""Align DB schema with design: snapshots fields, test lab, live view, signals."""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260205_phase1_schema_alignment"
down_revision = "d1e2f3g4h5i6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- snapshots: add agent trajectory + signal fields ---
    op.add_column("snapshots", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("snapshots", sa.Column("agent_id", sa.String(length=100), nullable=True))
    op.add_column("snapshots", sa.Column("parent_span_id", sa.String(length=255), nullable=True))
    op.add_column("snapshots", sa.Column("span_order", sa.Integer(), nullable=True))
    op.add_column("snapshots", sa.Column("is_parallel", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("snapshots", sa.Column("model_settings", sa.JSON(), nullable=True))
    op.add_column("snapshots", sa.Column("system_prompt", sa.Text(), nullable=True))
    op.add_column("snapshots", sa.Column("user_message", sa.Text(), nullable=True))
    op.add_column("snapshots", sa.Column("response", sa.Text(), nullable=True))
    op.add_column("snapshots", sa.Column("latency_ms", sa.Integer(), nullable=True))
    op.add_column("snapshots", sa.Column("tokens_used", sa.Integer(), nullable=True))
    op.add_column("snapshots", sa.Column("cost", sa.Numeric(10, 6), nullable=True))
    op.add_column("snapshots", sa.Column("signal_result", sa.JSON(), nullable=True))
    op.add_column("snapshots", sa.Column("is_worst", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("snapshots", sa.Column("worst_status", sa.String(length=20), nullable=True))
    op.create_foreign_key(
        "fk_snapshots_project_id",
        "snapshots",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "idx_snapshots_project_created",
        "snapshots",
        ["project_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_snapshots_agent",
        "snapshots",
        ["project_id", "agent_id"],
        unique=False,
    )
    op.create_index(
        "idx_snapshots_worst",
        "snapshots",
        ["project_id", "agent_id", "is_worst"],
        unique=False,
    )

    # --- signal_configs: replace with design-compliant schema ---
    op.drop_table("signal_configs")
    op.create_table(
        "signal_configs",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("signal_type", sa.String(length=50), nullable=False),
        sa.Column("params", sa.JSON(), nullable=True),
        sa.Column("severity", sa.String(length=20), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_signal_configs_project_id", "signal_configs", ["project_id"], unique=False)

    # --- test_runs ---
    op.create_table(
        "test_runs",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("test_type", sa.String(length=50), nullable=False),
        sa.Column("agent_config", sa.JSON(), nullable=True),
        sa.Column("signal_config", sa.JSON(), nullable=True),
        sa.Column("total_count", sa.Integer(), nullable=True),
        sa.Column("pass_count", sa.Integer(), nullable=True),
        sa.Column("fail_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="running"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_test_runs_project_id", "test_runs", ["project_id"], unique=False)

    # --- test_results ---
    op.create_table(
        "test_results",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.String(length=100), nullable=True),
        sa.Column("test_run_id", sa.String(length=255), nullable=True),
        sa.Column("step_order", sa.Integer(), nullable=True),
        sa.Column("parent_step_id", sa.String(length=255), nullable=True),
        sa.Column("is_parallel", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("input", sa.Text(), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("response", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("cost", sa.Numeric(10, 6), nullable=True),
        sa.Column("signal_result", sa.JSON(), nullable=True),
        sa.Column("is_worst", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("worst_status", sa.String(length=20), nullable=True),
        sa.Column("baseline_snapshot_id", sa.Integer(), nullable=True),
        sa.Column("baseline_response", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["test_run_id"], ["test_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["baseline_snapshot_id"], ["snapshots.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_test_results_project_id", "test_results", ["project_id", "created_at"], unique=False)
    op.create_index("ix_test_results_agent", "test_results", ["project_id", "agent_id"], unique=False)
    op.create_index("ix_test_results_worst", "test_results", ["project_id", "agent_id", "is_worst"], unique=False)
    op.create_index("ix_test_results_run", "test_results", ["test_run_id"], unique=False)

    # --- test_lab_canvases ---
    op.create_table(
        "test_lab_canvases",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("boxes", sa.JSON(), nullable=True),
        sa.Column("connections", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_test_lab_canvases_project_id", "test_lab_canvases", ["project_id"], unique=False)

    # --- live_view_connections ---
    op.create_table(
        "live_view_connections",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("source_agent_name", sa.String(length=100), nullable=False),
        sa.Column("target_agent_name", sa.String(length=100), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_live_view_connections_project_id", "live_view_connections", ["project_id"], unique=False)

    # --- replay_runs ---
    op.create_table(
        "replay_runs",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("run_type", sa.String(length=20), nullable=True),
        sa.Column("target_model", sa.String(length=100), nullable=True),
        sa.Column("snapshot_count", sa.Integer(), nullable=True),
        sa.Column("repeat_count", sa.Integer(), nullable=True),
        sa.Column("safe_count", sa.Integer(), nullable=True),
        sa.Column("needs_review_count", sa.Integer(), nullable=True),
        sa.Column("critical_count", sa.Integer(), nullable=True),
        sa.Column("total_latency_ms", sa.BigInteger(), nullable=True),
        sa.Column("total_cost", sa.Numeric(10, 4), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_replay_runs_project_id", "replay_runs", ["project_id"], unique=False)

    # --- agent_display_settings ---
    op.create_table(
        "agent_display_settings",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("system_prompt_hash", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("system_prompt_hash", name="uq_agent_display_settings_system_prompt_hash"),
    )
    op.create_index("ix_agent_display_settings_project_id", "agent_display_settings", ["project_id"], unique=False)

    # --- reviews / review_cases: link to test runs & results for HITL auto-reviews ---
    op.add_column("reviews", sa.Column("test_run_id", sa.String(length=255), nullable=True))
    op.add_column("reviews", sa.Column("origin", sa.String(length=50), nullable=True))
    op.create_foreign_key(
        "fk_reviews_test_run_id",
        "reviews",
        "test_runs",
        ["test_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_reviews_project_origin",
        "reviews",
        ["project_id", "origin"],
        unique=False,
    )

    op.add_column("review_cases", sa.Column("test_result_id", sa.String(length=255), nullable=True))
    op.create_foreign_key(
        "fk_review_cases_test_result_id",
        "review_cases",
        "test_results",
        ["test_result_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_review_cases_test_result_id",
        "review_cases",
        ["test_result_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop review / review_cases additions
    op.drop_index("ix_review_cases_test_result_id", table_name="review_cases")
    op.drop_constraint("fk_review_cases_test_result_id", "review_cases", type_="foreignkey")
    op.drop_column("review_cases", "test_result_id")

    op.drop_index("ix_reviews_project_origin", table_name="reviews")
    op.drop_constraint("fk_reviews_test_run_id", "reviews", type_="foreignkey")
    op.drop_column("reviews", "origin")
    op.drop_column("reviews", "test_run_id")

    # Drop new tables
    op.drop_index("ix_agent_display_settings_project_id", table_name="agent_display_settings")
    op.drop_table("agent_display_settings")

    op.drop_index("ix_replay_runs_project_id", table_name="replay_runs")
    op.drop_table("replay_runs")

    op.drop_index("ix_live_view_connections_project_id", table_name="live_view_connections")
    op.drop_table("live_view_connections")

    op.drop_index("ix_test_lab_canvases_project_id", table_name="test_lab_canvases")
    op.drop_table("test_lab_canvases")

    op.drop_index("ix_test_results_run", table_name="test_results")
    op.drop_index("ix_test_results_worst", table_name="test_results")
    op.drop_index("ix_test_results_agent", table_name="test_results")
    op.drop_index("ix_test_results_project_id", table_name="test_results")
    op.drop_table("test_results")

    op.drop_index("ix_test_runs_project_id", table_name="test_runs")
    op.drop_table("test_runs")

    op.drop_index("ix_signal_configs_project_id", table_name="signal_configs")
    op.drop_table("signal_configs")

    # Drop added snapshot indexes and columns
    op.drop_index("idx_snapshots_worst", table_name="snapshots")
    op.drop_index("idx_snapshots_agent", table_name="snapshots")
    op.drop_index("idx_snapshots_project_created", table_name="snapshots")
    op.drop_constraint("fk_snapshots_project_id", "snapshots", type_="foreignkey")
    op.drop_column("snapshots", "worst_status")
    op.drop_column("snapshots", "is_worst")
    op.drop_column("snapshots", "signal_result")
    op.drop_column("snapshots", "cost")
    op.drop_column("snapshots", "tokens_used")
    op.drop_column("snapshots", "latency_ms")
    op.drop_column("snapshots", "response")
    op.drop_column("snapshots", "user_message")
    op.drop_column("snapshots", "system_prompt")
    op.drop_column("snapshots", "model_settings")
    op.drop_column("snapshots", "is_parallel")
    op.drop_column("snapshots", "span_order")
    op.drop_column("snapshots", "parent_span_id")
    op.drop_column("snapshots", "agent_id")
    op.drop_column("snapshots", "project_id")

    # Recreate legacy signal_configs table to reverse drop
    op.create_table(
        "signal_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("signal_type", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=True),
        sa.Column("threshold", sa.Float(), server_default="0.5", nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("custom_rule", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_signal_configs_project_id", "signal_configs", ["project_id"], unique=False)
