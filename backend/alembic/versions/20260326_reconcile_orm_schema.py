"""Align DB at head with SQLAlchemy models (5e5a / legacy drift).

- Create audit_logs (model + services expect it; no prior migration).
- Drop snapshots.request_content (legacy JSONB; Snapshot model uses structured fields).
- Restore alerts.resolved_by / resolved_at and FK to users.
- Restore quality_scores columns dropped by 5e5a but still on QualityScore model.
- Restore api_calls columns dropped by 5e5a but still on APICall model.
- Add shared_results.expires_at when missing (SharedResult model).

Revision ID: 20260326_reconcile_orm
Revises: 20260325_api_calls_chain_id
Create Date: 2026-03-26
"""

from alembic import op
import sqlalchemy as sa

revision = "20260326_reconcile_orm"
down_revision = "20260325_api_calls_chain_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    def _cols(table: str) -> set[str]:
        if not insp.has_table(table):
            return set()
        return {c["name"] for c in insp.get_columns(table)}

    # --- audit_logs ---
    if not insp.has_table("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("action", sa.String(length=100), nullable=False),
            sa.Column("resource_type", sa.String(length=50), nullable=True),
            sa.Column("resource_id", sa.Integer(), nullable=True),
            sa.Column("old_value", sa.JSON(), nullable=True),
            sa.Column("new_value", sa.JSON(), nullable=True),
            sa.Column("ip_address", sa.String(length=45), nullable=True),
            sa.Column("user_agent", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_audit_logs_id"), "audit_logs", ["id"], unique=False)
        op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"], unique=False)
        op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
        op.create_index(op.f("ix_audit_logs_resource_type"), "audit_logs", ["resource_type"], unique=False)
        op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"], unique=False)
        op.create_index("idx_audit_user_created", "audit_logs", ["user_id", "created_at"], unique=False)
        op.create_index("idx_audit_resource", "audit_logs", ["resource_type", "resource_id"], unique=False)
        op.create_index("idx_audit_action", "audit_logs", ["action", "created_at"], unique=False)

    # --- snapshots: legacy column not in model ---
    if insp.has_table("snapshots") and "request_content" in _cols("snapshots"):
        op.drop_column("snapshots", "request_content")

    # --- alerts ---
    ac = _cols("alerts")
    if insp.has_table("alerts"):
        if "resolved_by" not in ac:
            op.add_column("alerts", sa.Column("resolved_by", sa.Integer(), nullable=True))
        if "resolved_at" not in ac:
            op.add_column("alerts", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
        insp_alerts = sa.inspect(bind)
        if "resolved_by" in {c["name"] for c in insp_alerts.get_columns("alerts")}:
            if not any(
                fk.get("referred_table") == "users" and fk.get("constrained_columns") == ["resolved_by"]
                for fk in insp_alerts.get_foreign_keys("alerts")
            ):
                op.create_foreign_key(None, "alerts", "users", ["resolved_by"], ["id"])

    # --- quality_scores (5e5a removed columns still on model) ---
    if insp.has_table("quality_scores"):
        qc = _cols("quality_scores")
        if "api_call_id" not in qc:
            op.add_column("quality_scores", sa.Column("api_call_id", sa.Integer(), nullable=True))
        if "json_valid" not in qc:
            op.add_column("quality_scores", sa.Column("json_valid", sa.Boolean(), nullable=True))
        if "required_fields_present" not in qc:
            op.add_column("quality_scores", sa.Column("required_fields_present", sa.Boolean(), nullable=True))
        if "length_acceptable" not in qc:
            op.add_column("quality_scores", sa.Column("length_acceptable", sa.Boolean(), nullable=True))
        if "format_valid" not in qc:
            op.add_column("quality_scores", sa.Column("format_valid", sa.Boolean(), nullable=True))
        if "semantic_consistency_score" not in qc:
            op.add_column(
                "quality_scores",
                sa.Column("semantic_consistency_score", sa.Float(), nullable=True),
            )
        if "tone_score" not in qc:
            op.add_column("quality_scores", sa.Column("tone_score", sa.Float(), nullable=True))
        if "coherence_score" not in qc:
            op.add_column("quality_scores", sa.Column("coherence_score", sa.Float(), nullable=True))
        if "evaluation_details" not in qc:
            op.add_column("quality_scores", sa.Column("evaluation_details", sa.JSON(), nullable=True))
        if "violations" not in qc:
            op.add_column("quality_scores", sa.Column("violations", sa.JSON(), nullable=True))
        insp_qs = sa.inspect(bind)
        qcols = {c["name"] for c in insp_qs.get_columns("quality_scores")}
        qix = {i["name"] for i in insp_qs.get_indexes("quality_scores")}
        if "ix_quality_scores_api_call_id" not in qix and "api_call_id" in qcols:
            op.create_index("ix_quality_scores_api_call_id", "quality_scores", ["api_call_id"], unique=False)
        if "api_call_id" in qcols:
            if not any(
                fk.get("referred_table") == "api_calls" and fk.get("constrained_columns") == ["api_call_id"]
                for fk in insp_qs.get_foreign_keys("quality_scores")
            ):
                op.create_foreign_key(
                    None, "quality_scores", "api_calls", ["api_call_id"], ["id"], ondelete="CASCADE"
                )

    # --- api_calls (5e5a removed; model still has) ---
    if insp.has_table("api_calls"):
        cc = _cols("api_calls")
        if "request_prompt" not in cc:
            op.add_column("api_calls", sa.Column("request_prompt", sa.Text(), nullable=True))
        if "request_data" not in cc:
            op.add_column("api_calls", sa.Column("request_data", sa.JSON(), nullable=True))
        if "response_data" not in cc:
            op.add_column("api_calls", sa.Column("response_data", sa.JSON(), nullable=True))
        if "response_text" not in cc:
            op.add_column("api_calls", sa.Column("response_text", sa.Text(), nullable=True))
        if "request_tokens" not in cc:
            op.add_column("api_calls", sa.Column("request_tokens", sa.Integer(), nullable=True))
        if "response_tokens" not in cc:
            op.add_column("api_calls", sa.Column("response_tokens", sa.Integer(), nullable=True))

    # --- shared_results.expires_at ---
    if insp.has_table("shared_results") and "expires_at" not in _cols("shared_results"):
        op.add_column(
            "shared_results",
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    from sqlalchemy.dialects import postgresql

    bind = op.get_bind()
    insp = sa.inspect(bind)

    def _cols(table: str) -> set[str]:
        if not insp.has_table(table):
            return set()
        return {c["name"] for c in insp.get_columns(table)}

    def _ix(table: str) -> set[str]:
        if not insp.has_table(table):
            return set()
        return {i["name"] for i in insp.get_indexes(table)}

    def _fk_name(table: str, col: str, referred: str) -> str | None:
        if not insp.has_table(table):
            return None
        for fk in insp.get_foreign_keys(table):
            if fk.get("referred_table") == referred and fk.get("constrained_columns") == [col]:
                return fk.get("name")
        return None

    if insp.has_table("shared_results") and "expires_at" in _cols("shared_results"):
        op.drop_column("shared_results", "expires_at")

    if insp.has_table("api_calls"):
        for c in (
            "response_tokens",
            "request_tokens",
            "response_text",
            "response_data",
            "request_data",
            "request_prompt",
        ):
            live = {x["name"] for x in sa.inspect(bind).get_columns("api_calls")}
            if c in live:
                op.drop_column("api_calls", c)

    if insp.has_table("quality_scores"):
        fk = _fk_name("quality_scores", "api_call_id", "api_calls")
        if fk:
            op.drop_constraint(fk, "quality_scores", type_="foreignkey")
        qix_live = {i["name"] for i in sa.inspect(bind).get_indexes("quality_scores")}
        if "ix_quality_scores_api_call_id" in qix_live:
            op.drop_index("ix_quality_scores_api_call_id", table_name="quality_scores")
        for c in (
            "violations",
            "evaluation_details",
            "coherence_score",
            "tone_score",
            "semantic_consistency_score",
            "format_valid",
            "length_acceptable",
            "required_fields_present",
            "json_valid",
            "api_call_id",
        ):
            live = {x["name"] for x in sa.inspect(bind).get_columns("quality_scores")}
            if c in live:
                op.drop_column("quality_scores", c)

    if insp.has_table("alerts"):
        fk = _fk_name("alerts", "resolved_by", "users")
        if fk:
            op.drop_constraint(fk, "alerts", type_="foreignkey")
        if "resolved_at" in _cols("alerts"):
            op.drop_column("alerts", "resolved_at")
        if "resolved_by" in _cols("alerts"):
            op.drop_column("alerts", "resolved_by")

    if insp.has_table("snapshots") and "request_content" not in _cols("snapshots"):
        op.add_column(
            "snapshots",
            sa.Column("request_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        )  # match add_request_content_jsonb

    if insp.has_table("audit_logs"):
        aix = _ix("audit_logs")
        for name in (
            "idx_audit_action",
            "idx_audit_resource",
            "idx_audit_user_created",
            op.f("ix_audit_logs_created_at"),
            op.f("ix_audit_logs_resource_type"),
            op.f("ix_audit_logs_action"),
            op.f("ix_audit_logs_user_id"),
            op.f("ix_audit_logs_id"),
        ):
            if name in aix:
                op.drop_index(name, table_name="audit_logs")
        op.drop_table("audit_logs")
