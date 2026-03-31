"""Add billing event log and harden subscriptions billing state.

Revision ID: 20260331_billing_event_log
Revises: 20260330_sub_period_start
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260331_billing_event_log"
down_revision = "20260330_sub_period_start"
branch_labels = None
depends_on = None


def _has_column(insp: sa.Inspector, table_name: str, column_name: str) -> bool:
    return column_name in {c["name"] for c in insp.get_columns(table_name)}


def _has_index(insp: sa.Inspector, table_name: str, index_name: str) -> bool:
    return index_name in {i["name"] for i in insp.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("subscriptions"):
        with op.batch_alter_table("subscriptions") as batch:
            if not _has_column(insp, "subscriptions", "provider"):
                batch.add_column(sa.Column("provider", sa.String(length=32), nullable=False, server_default="paddle"))
            if not _has_column(insp, "subscriptions", "provider_environment"):
                batch.add_column(
                    sa.Column("provider_environment", sa.String(length=16), nullable=False, server_default="unknown")
                )
            if not _has_column(insp, "subscriptions", "canceled_at"):
                batch.add_column(sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True))
            if not _has_column(insp, "subscriptions", "cancel_effective_at"):
                batch.add_column(sa.Column("cancel_effective_at", sa.DateTime(timezone=True), nullable=True))
            if not _has_column(insp, "subscriptions", "last_provider_event_at"):
                batch.add_column(sa.Column("last_provider_event_at", sa.DateTime(timezone=True), nullable=True))
            if not _has_column(insp, "subscriptions", "last_reconciled_at"):
                batch.add_column(sa.Column("last_reconciled_at", sa.DateTime(timezone=True), nullable=True))

    if not insp.has_table("billing_events"):
        op.create_table(
            "billing_events",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("provider", sa.String(length=32), nullable=False),
            sa.Column("provider_environment", sa.String(length=16), nullable=False),
            sa.Column("provider_event_id", sa.String(length=255), nullable=False),
            sa.Column("event_type", sa.String(length=128), nullable=False),
            sa.Column("event_created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("processing_status", sa.String(length=32), nullable=False, server_default="received"),
            sa.Column("processing_error", sa.String(), nullable=True),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("payload_hash", sa.String(length=64), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("subscription_id", sa.Integer(), nullable=True),
            sa.Column("provider_customer_id", sa.String(length=255), nullable=True),
            sa.Column("provider_subscription_id", sa.String(length=255), nullable=True),
            sa.Column("idempotency_key", sa.String(length=255), nullable=False),
            sa.Column("replay_count", sa.Integer(), nullable=False, server_default="0"),
            sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_billing_events_provider_event_id", "billing_events", ["provider_event_id"], unique=False)
        op.create_index("ix_billing_events_event_type", "billing_events", ["event_type"], unique=False)
        op.create_index("ix_billing_events_processing_status", "billing_events", ["processing_status"], unique=False)
        op.create_index("ix_billing_events_payload_hash", "billing_events", ["payload_hash"], unique=False)
        op.create_index("ix_billing_events_user_id", "billing_events", ["user_id"], unique=False)
        op.create_index("ix_billing_events_subscription_id", "billing_events", ["subscription_id"], unique=False)
        op.create_index(
            "ix_billing_events_provider_customer_id",
            "billing_events",
            ["provider_customer_id"],
            unique=False,
        )
        op.create_index(
            "ix_billing_events_provider_subscription_id",
            "billing_events",
            ["provider_subscription_id"],
            unique=False,
        )
        op.create_index("ux_billing_events_idempotency_key", "billing_events", ["idempotency_key"], unique=True)
        op.create_index(
            "ux_billing_events_provider_event",
            "billing_events",
            ["provider", "provider_environment", "provider_event_id"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("billing_events"):
        for index_name in (
            "ux_billing_events_provider_event",
            "ux_billing_events_idempotency_key",
            "ix_billing_events_provider_subscription_id",
            "ix_billing_events_provider_customer_id",
            "ix_billing_events_subscription_id",
            "ix_billing_events_user_id",
            "ix_billing_events_payload_hash",
            "ix_billing_events_processing_status",
            "ix_billing_events_event_type",
            "ix_billing_events_provider_event_id",
        ):
            if _has_index(insp, "billing_events", index_name):
                op.drop_index(index_name, table_name="billing_events")
        op.drop_table("billing_events")

    if insp.has_table("subscriptions"):
        with op.batch_alter_table("subscriptions") as batch:
            if _has_column(insp, "subscriptions", "last_reconciled_at"):
                batch.drop_column("last_reconciled_at")
            if _has_column(insp, "subscriptions", "last_provider_event_at"):
                batch.drop_column("last_provider_event_at")
            if _has_column(insp, "subscriptions", "cancel_effective_at"):
                batch.drop_column("cancel_effective_at")
            if _has_column(insp, "subscriptions", "canceled_at"):
                batch.drop_column("canceled_at")
            if _has_column(insp, "subscriptions", "provider_environment"):
                batch.drop_column("provider_environment")
            if _has_column(insp, "subscriptions", "provider"):
                batch.drop_column("provider")
