"""Create legacy app tables that were never added via Alembic (empty-DB CI).

Revision ID: 20260120_core_legacy
Revises: 20260120_bootstrap
Create Date: 2026-01-20

Schemas match what later revisions (e.g. 5e5a8559f4d4) expect before they alter/drop.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260120_core_legacy"
down_revision = "20260120_bootstrap"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("api_calls"):
        op.create_table(
            "api_calls",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("provider", sa.String(length=50), nullable=False),
            sa.Column("model", sa.String(length=100), nullable=False),
            sa.Column("agent_name", sa.String(length=100), nullable=True),
            sa.Column("chain_id", sa.String(length=255), nullable=True),
            sa.Column("request_prompt", sa.Text(), nullable=True),
            sa.Column(
                "request_data",
                postgresql.JSON(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column(
                "response_data",
                postgresql.JSON(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column("request_tokens", sa.Integer(), nullable=True),
            sa.Column("response_tokens", sa.Integer(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("response_text", sa.Text(), nullable=True),
            sa.Column("latency_ms", sa.Double(), nullable=True),
            sa.Column("status_code", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                name="api_calls_project_id_fkey",
            ),
        )
        op.create_index("ix_api_calls_provider", "api_calls", ["provider"], unique=False)
        op.create_index("ix_api_calls_model", "api_calls", ["model"], unique=False)
        op.create_index("ix_api_calls_chain_id", "api_calls", ["chain_id"], unique=False)
        op.create_index("ix_api_calls_agent_name", "api_calls", ["agent_name"], unique=False)
        op.create_index("idx_provider_model", "api_calls", ["provider", "model"], unique=False)
        op.create_index("idx_project_created", "api_calls", ["project_id", "created_at"], unique=False)
        op.create_index("idx_chain_id", "api_calls", ["chain_id", "created_at"], unique=False)

    if not insp.has_table("quality_scores"):
        op.create_table(
            "quality_scores",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("api_call_id", sa.Integer(), nullable=False),
            sa.Column("overall_score", sa.Double(), nullable=False, server_default="0"),
            sa.Column("coherence_score", sa.Double(), nullable=True),
            sa.Column("semantic_consistency_score", sa.Double(), nullable=True),
            sa.Column("tone_score", sa.Double(), nullable=True),
            sa.Column("json_valid", sa.Boolean(), nullable=True),
            sa.Column("violations", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("format_valid", sa.Boolean(), nullable=True),
            sa.Column("evaluation_details", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("required_fields_present", sa.Boolean(), nullable=True),
            sa.Column("length_acceptable", sa.Boolean(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                name="quality_scores_project_id_fkey",
            ),
            sa.ForeignKeyConstraint(
                ["api_call_id"],
                ["api_calls.id"],
                name="quality_scores_api_call_id_fkey",
            ),
        )
        op.create_index(
            "ix_quality_scores_api_call_id", "quality_scores", ["api_call_id"], unique=False
        )

    if not insp.has_table("alerts"):
        op.create_table(
            "alerts",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("alert_type", sa.String(length=50), nullable=False),
            sa.Column("severity", sa.String(length=20), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("is_resolved", sa.Boolean(), server_default="false", nullable=True),
            sa.Column("message", sa.Text(), nullable=False, server_default=""),
            sa.Column("notification_channels", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("resolved_by", sa.Integer(), nullable=True),
            sa.Column("alert_data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_sent", sa.Boolean(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                name="alerts_project_id_fkey",
            ),
            sa.ForeignKeyConstraint(
                ["resolved_by"],
                ["users.id"],
                name="alerts_resolved_by_fkey",
            ),
        )
        op.create_index("ix_alerts_alert_type", "alerts", ["alert_type"], unique=False)

    if not insp.has_table("shadow_comparisons"):
        op.create_table(
            "shadow_comparisons",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("primary_api_call_id", sa.Integer(), nullable=False),
            sa.Column("primary_model", sa.String(length=100), nullable=False),
            sa.Column("shadow_api_call_id", sa.Integer(), nullable=False),
            sa.Column("shadow_model", sa.String(length=100), nullable=False),
            sa.Column("similarity_score", sa.Double(), nullable=True),
            sa.Column("difference_type", sa.String(length=50), nullable=True),
            sa.Column("difference_percentage", sa.Double(), nullable=True),
            sa.Column("difference_details", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("alert_sent", sa.Boolean(), nullable=True),
            sa.Column("alert_id", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], name="shadow_comparisons_alert_id_fkey"),
            sa.ForeignKeyConstraint(
                ["primary_api_call_id"],
                ["api_calls.id"],
                name="shadow_comparisons_primary_api_call_id_fkey",
            ),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="shadow_comparisons_project_id_fkey"),
            sa.ForeignKeyConstraint(
                ["shadow_api_call_id"],
                ["api_calls.id"],
                name="shadow_comparisons_shadow_api_call_id_fkey",
            ),
        )
        op.create_index(
            "ix_shadow_comparisons_shadow_api_call_id",
            "shadow_comparisons",
            ["shadow_api_call_id"],
            unique=False,
        )
        op.create_index(
            "ix_shadow_comparisons_project_id", "shadow_comparisons", ["project_id"], unique=False
        )
        op.create_index(
            "ix_shadow_comparisons_primary_api_call_id",
            "shadow_comparisons",
            ["primary_api_call_id"],
            unique=False,
        )
        op.create_index("ix_shadow_comparisons_id", "shadow_comparisons", ["id"], unique=False)
        op.create_index(
            "ix_shadow_comparisons_created_at", "shadow_comparisons", ["created_at"], unique=False
        )

    if not insp.has_table("drift_detections"):
        op.create_table(
            "drift_detections",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("agent_name", sa.String(length=100), nullable=True),
            sa.Column("detection_type", sa.String(length=50), nullable=False),
            sa.Column("model", sa.String(length=100), nullable=True),
            sa.Column("baseline_period_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("baseline_period_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column("severity", sa.String(length=20), nullable=False),
            sa.Column(
                "detected_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("baseline_value", sa.Double(), nullable=True),
            sa.Column("current_value", sa.Double(), nullable=True),
            sa.Column("change_percentage", sa.Double(), nullable=False, server_default="0"),
            sa.Column("affected_fields", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("detection_details", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                name="drift_detections_project_id_fkey",
            ),
        )
        op.create_index("ix_drift_detections_agent_name", "drift_detections", ["agent_name"], unique=False)
        op.create_index(
            "ix_drift_detections_detection_type", "drift_detections", ["detection_type"], unique=False
        )
        op.create_index("ix_drift_detections_model", "drift_detections", ["model"], unique=False)
        op.create_index("ix_drift_detections_detected_at", "drift_detections", ["detected_at"], unique=False)

    if not insp.has_table("activity_logs"):
        op.create_table(
            "activity_logs",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=True),
            sa.Column("activity_type", sa.String(length=50), nullable=False),
            sa.Column("action", sa.String(length=100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("activity_data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                name="activity_logs_project_id_fkey",
            ),
        )
        op.create_index("ix_activity_logs_user_id", "activity_logs", ["user_id"], unique=False)
        op.create_index("ix_activity_logs_project_id", "activity_logs", ["project_id"], unique=False)
        op.create_index("idx_activity_user_created", "activity_logs", ["user_id", "created_at"], unique=False)
        op.create_index(
            "idx_activity_project_created", "activity_logs", ["project_id", "created_at"], unique=False
        )

    if not insp.has_table("usage"):
        op.create_table(
            "usage",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("project_id", sa.Integer(), nullable=True),
            sa.Column("metric_name", sa.String(length=50), nullable=False),
            sa.Column("quantity", sa.BigInteger(), server_default="0", nullable=True),
            sa.Column("unit", sa.String(length=20), nullable=True),
            sa.Column(
                "timestamp",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                name="usage_project_id_fkey",
            ),
        )

    if not insp.has_table("webhooks"):
        op.create_table(
            "webhooks",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("project_id", sa.Integer(), nullable=True),
            sa.Column("url", sa.String(length=1000), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=True),
            sa.Column("secret", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=True),
            sa.Column("events", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                name="webhooks_project_id_fkey",
            ),
        )

    if not insp.has_table("project_members"):
        op.create_table(
            "project_members",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("role", sa.String(length=20), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                name="project_members_project_id_fkey",
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.UniqueConstraint("project_id", "user_id", name="uq_project_user"),
        )
        op.create_index("idx_project_member", "project_members", ["project_id", "user_id"], unique=False)

    if not insp.has_table("api_keys"):
        op.create_table(
            "api_keys",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("key_hash", sa.String(length=255), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)

    if not insp.has_table("evaluation_rubrics"):
        op.create_table(
            "evaluation_rubrics",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("criteria_prompt", sa.Text(), nullable=False),
            sa.Column("min_score", sa.Integer(), nullable=True),
            sa.Column("max_score", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_evaluation_rubrics_id", "evaluation_rubrics", ["id"], unique=False)
        op.create_index(
            "ix_evaluation_rubrics_project_id", "evaluation_rubrics", ["project_id"], unique=False
        )
        op.create_index(
            "ix_evaluation_rubrics_created_at", "evaluation_rubrics", ["created_at"], unique=False
        )

    if not insp.has_table("rule_market"):
        op.create_table(
            "rule_market",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("author_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("rule_type", sa.String(length=50), nullable=False),
            sa.Column("pattern", sa.Text(), nullable=False),
            sa.Column("pattern_type", sa.String(length=50), nullable=False),
            sa.Column("category", sa.String(length=100), nullable=True),
            sa.Column(
                "tags",
                postgresql.JSON(astext_type=sa.Text()),
                nullable=False,
                server_default="[]",
            ),
            sa.Column("download_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rating", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("rating_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_approved", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("is_featured", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(
                ["author_id"],
                ["users.id"],
                name="rule_market_author_id_fkey",
                ondelete="SET NULL",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_rule_market_id", "rule_market", ["id"], unique=False)
        op.create_index("ix_rule_market_author_id", "rule_market", ["author_id"], unique=False)
        op.create_index("ix_rule_market_rule_type", "rule_market", ["rule_type"], unique=False)
        op.create_index("ix_rule_market_category", "rule_market", ["category"], unique=False)
        op.create_index("ix_rule_market_is_approved", "rule_market", ["is_approved"], unique=False)
        op.create_index("ix_rule_market_is_featured", "rule_market", ["is_featured"], unique=False)
        op.create_index("ix_rule_market_created_at", "rule_market", ["created_at"], unique=False)
        op.create_index(
            "ix_rule_market_category_approved", "rule_market", ["category", "is_approved"], unique=False
        )
        op.create_index(
            "ix_rule_market_featured_approved",
            "rule_market",
            ["is_featured", "is_approved"],
            unique=False,
        )

    if not insp.has_table("public_benchmarks"):
        op.create_table(
            "public_benchmarks",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("author_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("benchmark_type", sa.String(length=50), nullable=False),
            sa.Column("benchmark_data", postgresql.JSON(astext_type=sa.Text()), nullable=False),
            sa.Column("test_cases_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("category", sa.String(length=100), nullable=True),
            sa.Column(
                "tags",
                postgresql.JSON(astext_type=sa.Text()),
                nullable=False,
                server_default="[]",
            ),
            sa.Column("is_featured", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("is_approved", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(
                ["author_id"],
                ["users.id"],
                name="public_benchmarks_author_id_fkey",
                ondelete="SET NULL",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_public_benchmarks_id", "public_benchmarks", ["id"], unique=False)
        op.create_index("ix_public_benchmarks_author_id", "public_benchmarks", ["author_id"], unique=False)
        op.create_index(
            "ix_public_benchmarks_benchmark_type", "public_benchmarks", ["benchmark_type"], unique=False
        )
        op.create_index("ix_public_benchmarks_category", "public_benchmarks", ["category"], unique=False)
        op.create_index(
            "ix_public_benchmarks_is_featured", "public_benchmarks", ["is_featured"], unique=False
        )
        op.create_index(
            "ix_public_benchmarks_is_approved", "public_benchmarks", ["is_approved"], unique=False
        )
        op.create_index(
            "ix_public_benchmarks_created_at", "public_benchmarks", ["created_at"], unique=False
        )
        op.create_index(
            "ix_public_benchmark_category_approved",
            "public_benchmarks",
            ["category", "is_approved"],
            unique=False,
        )
        op.create_index(
            "ix_public_benchmark_featured_approved",
            "public_benchmarks",
            ["is_featured", "is_approved"],
            unique=False,
        )

    if not insp.has_table("shared_results"):
        op.create_table(
            "shared_results",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column(
                "result_data",
                postgresql.JSON(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column(
                "result_type",
                sa.String(length=50),
                nullable=False,
                server_default="test",
            ),
            sa.Column("token", sa.String(length=64), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=False),
            sa.Column("read_only", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("result_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["created_by"],
                ["users.id"],
                name="shared_results_created_by_fkey",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_shared_results_token", "shared_results", ["token"], unique=True)
        op.create_index("ix_shared_results_result_type", "shared_results", ["result_type"], unique=False)
        op.create_index("ix_shared_results_created_by", "shared_results", ["created_by"], unique=False)
        op.create_index("ix_shared_results_created_at", "shared_results", ["created_at"], unique=False)
        op.create_index("idx_shared_result_token", "shared_results", ["token"], unique=False)
        op.create_index(
            "idx_shared_result_project", "shared_results", ["project_id", "created_at"], unique=False
        )

    if not insp.has_table("subscriptions"):
        op.create_table(
            "subscriptions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("paddle_subscription_id", sa.String(length=255), nullable=True),
            sa.Column(
                "current_period_start",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("trial_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column("plan_type", sa.String(length=20), nullable=False, server_default="free"),
            sa.Column("price_per_month", sa.Double(), nullable=True),
            sa.Column("paddle_customer_id", sa.String(length=255), nullable=True),
            sa.Column("cancel_at_period_end", sa.String(length=5), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=True),
            sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["users.id"],
                name="subscriptions_user_id_fkey",
            ),
        )
        op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"], unique=True)
        op.create_index(
            "ix_subscriptions_paddle_subscription_id",
            "subscriptions",
            ["paddle_subscription_id"],
            unique=True,
        )
        op.create_index(
            "ix_subscriptions_paddle_customer_id", "subscriptions", ["paddle_customer_id"], unique=False
        )
        op.create_index("idx_subscription_user_status", "subscriptions", ["user_id", "status"], unique=False)
        op.create_index("idx_subscription_plan", "subscriptions", ["plan_type", "status"], unique=False)

    if not insp.has_table("notification_settings"):
        op.create_table(
            "notification_settings",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("slack_webhook_url", sa.Text(), nullable=True),
            sa.Column("discord_webhook_url", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("email_quality_drop", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("email_cost_anomaly", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("in_app_cost_anomaly", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("email_drift", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("slack_enabled", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("discord_enabled", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("in_app_drift", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("in_app_quality_drop", sa.Boolean(), nullable=False, server_default="true"),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["users.id"],
                name="notification_settings_user_id_fkey",
            ),
        )
        op.create_index(
            "ix_notification_settings_user_id", "notification_settings", ["user_id"], unique=True
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    def drop_if(name: str) -> None:
        if insp.has_table(name):
            op.drop_table(name)

    # Respect FKs: children first
    drop_if("shadow_comparisons")
    drop_if("quality_scores")
    drop_if("api_calls")
    drop_if("alerts")
    drop_if("drift_detections")
    drop_if("activity_logs")
    drop_if("usage")
    drop_if("webhooks")
    drop_if("project_members")
    drop_if("api_keys")
    drop_if("shared_results")
    drop_if("public_benchmarks")
    drop_if("rule_market")
    drop_if("evaluation_rubrics")
    drop_if("subscriptions")
    drop_if("notification_settings")
