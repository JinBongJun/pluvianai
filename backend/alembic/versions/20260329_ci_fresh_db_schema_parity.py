"""Fresh-DB parity for alembic check (CI empty Postgres).

- Drop legacy review / worst-prompt tables (no ORM; still created by d1e2f3 + 20260205).
- Align columns, nullability, FKs, and indexes with SQLAlchemy models.

Revision ID: 20260329_ci_fresh_db_parity
Revises: 20260328_drop_validation_id_ix
Create Date: 2026-03-29
"""

from alembic import op
import sqlalchemy as sa

revision = "20260329_ci_fresh_db_parity"
down_revision = "20260328_drop_validation_id_ix"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _ix(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {i["name"] for i in insp.get_indexes(table)}


def _uq_names(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {u["name"] for u in insp.get_unique_constraints(table) if u.get("name")}


def _create_index_if_missing(bind, table: str, name: str, columns: list[str], *, unique: bool = False) -> None:
    if name in _ix(bind, table):
        return
    op.create_index(name, table, columns, unique=unique)


def _drop_index_if_exists(bind, table: str, name: str) -> None:
    if name in _ix(bind, table):
        op.drop_index(name, table_name=table)


def upgrade() -> None:
    bind = op.get_bind()

    # --- Legacy tables (no models in Base.metadata) ---
    for stmt in (
        "DROP TABLE IF EXISTS review_cases CASCADE",
        "DROP TABLE IF EXISTS review_comments CASCADE",
        "DROP TABLE IF EXISTS reviews CASCADE",
        "DROP TABLE IF EXISTS worst_prompt_set_members CASCADE",
        "DROP TABLE IF EXISTS worst_prompt_sets CASCADE",
        "DROP TABLE IF EXISTS worst_prompts CASCADE",
    ):
        op.execute(sa.text(stmt))

    # --- users: duplicate unique on email; referred_by FK ---
    if sa.inspect(bind).has_table("users"):
        uix = {i["name"]: i for i in sa.inspect(bind).get_indexes("users")}
        email_ix = uix.get(op.f("ix_users_email")) or uix.get("ix_users_email")
        if "uq_users_email" in _uq_names(bind, "users") and email_ix and email_ix.get("unique"):
            op.drop_constraint("uq_users_email", "users", type_="unique")
        uc = _cols(bind, "users")
        if "referred_by" in uc:
            has_rb_fk = any(
                fk.get("referred_table") == "users" and fk.get("constrained_columns") == ["referred_by"]
                for fk in sa.inspect(bind).get_foreign_keys("users")
            )
            if not has_rb_fk:
                op.create_foreign_key(None, "users", "users", ["referred_by"], ["id"])

    # --- projects: owner_id index not on model ---
    _drop_index_if_exists(bind, "projects", op.f("ix_projects_owner_id"))

    # --- project_members: user_id FK CASCADE ---
    if sa.inspect(bind).has_table("project_members"):
        for fk in sa.inspect(bind).get_foreign_keys("project_members"):
            if fk.get("constrained_columns") == ["user_id"] and fk.get("referred_table") == "users":
                name = fk.get("name")
                if name:
                    op.drop_constraint(name, "project_members", type_="foreignkey")
                break
        insp_pm = sa.inspect(bind)
        if not any(
            fk.get("referred_table") == "users" and fk.get("constrained_columns") == ["user_id"]
            for fk in insp_pm.get_foreign_keys("project_members")
        ):
            op.create_foreign_key(
                None, "project_members", "users", ["user_id"], ["id"], ondelete="CASCADE"
            )

    # --- user_agreements: model uses UniqueConstraint, not standalone unique index ---
    if sa.inspect(bind).has_table("user_agreements"):
        _drop_index_if_exists(bind, "user_agreements", op.f("ix_user_agreements_user_id"))
        insp = sa.inspect(bind)
        has_user_uq = any(
            tuple(uq.get("column_names") or ()) == ("user_id",)
            for uq in insp.get_unique_constraints("user_agreements")
        )
        if not has_user_uq:
            op.create_unique_constraint("uq_user_agreements_user_id", "user_agreements", ["user_id"])

    # --- notification_settings.updated_at ---
    if sa.inspect(bind).has_table("notification_settings"):
        nc = _cols(bind, "notification_settings")
        if "updated_at" not in nc:
            op.add_column(
                "notification_settings",
                sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            )

    # --- subscriptions.updated_at ---
    if sa.inspect(bind).has_table("subscriptions"):
        sc = _cols(bind, "subscriptions")
        if "updated_at" not in sc:
            op.add_column(
                "subscriptions",
                sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            )

    # --- drift_detections.drift_score ---
    if sa.inspect(bind).has_table("drift_detections"):
        dc = _cols(bind, "drift_detections")
        if "drift_score" not in dc:
            op.add_column(
                "drift_detections",
                sa.Column("drift_score", sa.Float(), nullable=False, server_default="0"),
            )
            op.alter_column(
                "drift_detections",
                "drift_score",
                existing_type=sa.Float(),
                server_default=None,
                nullable=False,
            )

    # --- agent_display_settings: node_type + is_deleted nullable ---
    if sa.inspect(bind).has_table("agent_display_settings"):
        ac = _cols(bind, "agent_display_settings")
        if "node_type" not in ac:
            op.add_column(
                "agent_display_settings",
                sa.Column(
                    "node_type",
                    sa.String(length=50),
                    nullable=True,
                    server_default="agentCard",
                ),
            )
            op.alter_column(
                "agent_display_settings",
                "node_type",
                existing_type=sa.String(length=50),
                server_default=None,
                nullable=True,
            )
        with op.batch_alter_table("agent_display_settings") as batch:
            batch.alter_column(
                "is_deleted",
                existing_type=sa.Boolean(),
                nullable=True,
                existing_server_default=sa.text("false"),
            )

    # --- replay_runs: drop columns removed from model ---
    if sa.inspect(bind).has_table("replay_runs"):
        rc = _cols(bind, "replay_runs")
        for col in ("repeat_count", "safe_count", "needs_review_count", "critical_count"):
            if col in rc:
                op.drop_column("replay_runs", col)

    # --- signal_configs.enabled nullable ---
    if sa.inspect(bind).has_table("signal_configs"):
        with op.batch_alter_table("signal_configs") as batch:
            batch.alter_column(
                "enabled",
                existing_type=sa.Boolean(),
                nullable=True,
                existing_server_default=sa.text("true"),
            )

    # --- snapshots: drop legacy composite indexes; relax booleans ---
    for ixn in ("idx_snapshots_worst", "idx_snapshots_agent", "idx_snapshots_project_created"):
        _drop_index_if_exists(bind, "snapshots", ixn)
    _create_index_if_missing(bind, "snapshots", op.f("ix_snapshots_id"), ["id"])
    _create_index_if_missing(bind, "snapshots", op.f("ix_snapshots_project_id"), ["project_id"])
    _create_index_if_missing(bind, "snapshots", op.f("ix_snapshots_trace_id"), ["trace_id"])
    _create_index_if_missing(bind, "snapshots", op.f("ix_snapshots_agent_id"), ["agent_id"])
    _create_index_if_missing(bind, "snapshots", op.f("ix_snapshots_created_at"), ["created_at"])
    _create_index_if_missing(bind, "snapshots", op.f("ix_snapshots_is_deleted"), ["is_deleted"])
    if sa.inspect(bind).has_table("snapshots"):
        with op.batch_alter_table("snapshots") as batch:
            batch.alter_column(
                "is_parallel",
                existing_type=sa.Boolean(),
                nullable=True,
                existing_server_default=sa.text("false"),
            )
            batch.alter_column(
                "is_worst",
                existing_type=sa.Boolean(),
                nullable=True,
                existing_server_default=sa.text("false"),
            )

    # --- test_results: replace composite indexes with model indexes ---
    if sa.inspect(bind).has_table("test_results"):
        for ixn in (
            "ix_test_results_run",
            "ix_test_results_worst",
            "ix_test_results_agent",
            "ix_test_results_project_id",
        ):
            _drop_index_if_exists(bind, "test_results", ixn)
        with op.batch_alter_table("test_results") as batch:
            batch.alter_column(
                "is_parallel",
                existing_type=sa.Boolean(),
                nullable=True,
                existing_server_default=sa.text("false"),
            )
            batch.alter_column(
                "is_worst",
                existing_type=sa.Boolean(),
                nullable=True,
                existing_server_default=sa.text("false"),
            )

    # --- Per-column indexes (model index=True / op.f names) ---
    _create_index_if_missing(bind, "activity_logs", op.f("ix_activity_logs_id"), ["id"])
    _create_index_if_missing(bind, "activity_logs", op.f("ix_activity_logs_user_id"), ["user_id"])
    _create_index_if_missing(bind, "activity_logs", op.f("ix_activity_logs_project_id"), ["project_id"])
    _create_index_if_missing(bind, "activity_logs", op.f("ix_activity_logs_activity_type"), ["activity_type"])
    _create_index_if_missing(bind, "activity_logs", op.f("ix_activity_logs_created_at"), ["created_at"])

    _create_index_if_missing(bind, "agent_display_settings", op.f("ix_agent_display_settings_id"), ["id"])
    _create_index_if_missing(
        bind, "agent_display_settings", op.f("ix_agent_display_settings_created_at"), ["created_at"]
    )

    _create_index_if_missing(bind, "alerts", op.f("ix_alerts_id"), ["id"])
    _create_index_if_missing(bind, "alerts", op.f("ix_alerts_project_id"), ["project_id"])
    _create_index_if_missing(bind, "alerts", op.f("ix_alerts_created_at"), ["created_at"])

    _create_index_if_missing(bind, "api_calls", op.f("ix_api_calls_id"), ["id"])
    _create_index_if_missing(bind, "api_calls", op.f("ix_api_calls_project_id"), ["project_id"])
    _create_index_if_missing(bind, "api_calls", op.f("ix_api_calls_chain_id"), ["chain_id"])
    _create_index_if_missing(bind, "api_calls", op.f("ix_api_calls_created_at"), ["created_at"])

    _create_index_if_missing(bind, "api_keys", op.f("ix_api_keys_id"), ["id"])

    _create_index_if_missing(bind, "drift_detections", op.f("ix_drift_detections_id"), ["id"])
    _create_index_if_missing(bind, "drift_detections", op.f("ix_drift_detections_project_id"), ["project_id"])
    _create_index_if_missing(bind, "drift_detections", op.f("ix_drift_detections_created_at"), ["created_at"])

    _create_index_if_missing(bind, "live_view_connections", op.f("ix_live_view_connections_id"), ["id"])
    _create_index_if_missing(
        bind, "live_view_connections", op.f("ix_live_view_connections_project_id"), ["project_id"]
    )
    _create_index_if_missing(
        bind, "live_view_connections", op.f("ix_live_view_connections_created_at"), ["created_at"]
    )

    _create_index_if_missing(bind, "notification_settings", op.f("ix_notification_settings_id"), ["id"])

    _create_index_if_missing(bind, "project_members", op.f("ix_project_members_id"), ["id"])

    _create_index_if_missing(
        bind, "project_notification_settings", op.f("ix_project_notification_settings_id"), ["id"]
    )

    _create_index_if_missing(bind, "quality_scores", op.f("ix_quality_scores_id"), ["id"])
    _create_index_if_missing(bind, "quality_scores", op.f("ix_quality_scores_project_id"), ["project_id"])
    _create_index_if_missing(bind, "quality_scores", op.f("ix_quality_scores_created_at"), ["created_at"])

    _create_index_if_missing(bind, "refresh_tokens", op.f("ix_refresh_tokens_id"), ["id"])

    _create_index_if_missing(bind, "signal_detections", op.f("ix_signal_detections_id"), ["id"])
    _create_index_if_missing(bind, "signal_detections", op.f("ix_signal_detections_project_id"), ["project_id"])
    _create_index_if_missing(bind, "signal_detections", op.f("ix_signal_detections_snapshot_id"), ["snapshot_id"])
    _create_index_if_missing(bind, "signal_detections", op.f("ix_signal_detections_signal_type"), ["signal_type"])
    _create_index_if_missing(bind, "signal_detections", op.f("ix_signal_detections_created_at"), ["created_at"])

    _create_index_if_missing(bind, "replay_runs", op.f("ix_replay_runs_id"), ["id"])

    _create_index_if_missing(bind, "shared_results", op.f("ix_shared_results_id"), ["id"])
    _create_index_if_missing(bind, "shared_results", op.f("ix_shared_results_project_id"), ["project_id"])

    _create_index_if_missing(bind, "signal_configs", op.f("ix_signal_configs_id"), ["id"])
    _create_index_if_missing(bind, "signal_configs", op.f("ix_signal_configs_project_id"), ["project_id"])
    _create_index_if_missing(bind, "signal_configs", op.f("ix_signal_configs_created_at"), ["created_at"])

    _create_index_if_missing(bind, "subscriptions", op.f("ix_subscriptions_id"), ["id"])

    _create_index_if_missing(bind, "test_results", op.f("ix_test_results_id"), ["id"])
    _create_index_if_missing(bind, "test_results", op.f("ix_test_results_project_id"), ["project_id"])
    _create_index_if_missing(bind, "test_results", op.f("ix_test_results_agent_id"), ["agent_id"])
    _create_index_if_missing(bind, "test_results", op.f("ix_test_results_created_at"), ["created_at"])
    _create_index_if_missing(bind, "test_results", op.f("ix_test_results_test_run_id"), ["test_run_id"])

    _create_index_if_missing(bind, "test_runs", op.f("ix_test_runs_id"), ["id"])
    _create_index_if_missing(bind, "test_runs", op.f("ix_test_runs_project_id"), ["project_id"])
    _create_index_if_missing(bind, "test_runs", op.f("ix_test_runs_created_at"), ["created_at"])

    _create_index_if_missing(bind, "usage", op.f("ix_usage_id"), ["id"])

    _create_index_if_missing(bind, "user_agreements", op.f("ix_user_agreements_id"), ["id"])

    _create_index_if_missing(bind, "user_api_keys", op.f("ix_user_api_keys_id"), ["id"])

    _create_index_if_missing(bind, "webhooks", op.f("ix_webhooks_id"), ["id"])


def downgrade() -> None:
    pass
