"""Harden usage ledger for snapshot metering.

Revision ID: 20260401_usage_ledger
Revises: 20260401_free_usage_anchor
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_usage_ledger"
down_revision = "20260401_free_usage_anchor"
branch_labels = None
depends_on = None


def _column_names(bind, table_name: str) -> set[str]:
    return {col["name"] for col in sa.inspect(bind).get_columns(table_name)}


def _index_names(bind, table_name: str) -> set[str]:
    return {idx["name"] for idx in sa.inspect(bind).get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("usage"):
        return

    columns = _column_names(bind, "usage")
    indexes = _index_names(bind, "usage")

    if "source_type" not in columns:
        op.add_column("usage", sa.Column("source_type", sa.String(length=50), nullable=True))
    if "source_id" not in columns:
        op.add_column("usage", sa.Column("source_id", sa.String(length=128), nullable=True))
    if "idempotency_key" not in columns:
        op.add_column("usage", sa.Column("idempotency_key", sa.String(length=255), nullable=True))

    if "ix_usage_user_metric_timestamp" not in indexes:
        op.create_index(
            "ix_usage_user_metric_timestamp",
            "usage",
            ["user_id", "metric_name", "timestamp"],
            unique=False,
        )
    if "ix_usage_metric_timestamp" not in indexes:
        op.create_index(
            "ix_usage_metric_timestamp",
            "usage",
            ["metric_name", "timestamp"],
            unique=False,
        )
    if "ix_usage_source_type_source_id" not in indexes:
        op.create_index(
            "ix_usage_source_type_source_id",
            "usage",
            ["source_type", "source_id"],
            unique=False,
        )
    if "ix_usage_idempotency_key" not in indexes:
        op.create_index("ix_usage_idempotency_key", "usage", ["idempotency_key"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("usage"):
        return

    columns = _column_names(bind, "usage")
    indexes = _index_names(bind, "usage")

    for index_name in (
        "ix_usage_idempotency_key",
        "ix_usage_source_type_source_id",
        "ix_usage_metric_timestamp",
        "ix_usage_user_metric_timestamp",
    ):
        if index_name in indexes:
            op.drop_index(index_name, table_name="usage")

    if "idempotency_key" in columns:
        op.drop_column("usage", "idempotency_key")
    if "source_id" in columns:
        op.drop_column("usage", "source_id")
    if "source_type" in columns:
        op.drop_column("usage", "source_type")
