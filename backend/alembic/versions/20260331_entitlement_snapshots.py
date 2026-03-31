"""Add entitlement snapshots table.

Revision ID: 20260331_entitlement_snapshots
Revises: 20260331_billing_event_log
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260331_entitlement_snapshots"
down_revision = "20260331_billing_event_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("entitlement_snapshots"):
        op.create_table(
            "entitlement_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("subscription_id", sa.Integer(), nullable=True),
            sa.Column("effective_plan_id", sa.String(length=64), nullable=False),
            sa.Column("entitlement_status", sa.String(length=32), nullable=False),
            sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
            sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
            sa.Column("limits_json", sa.JSON(), nullable=False),
            sa.Column("features_json", sa.JSON(), nullable=False),
            sa.Column("source", sa.String(length=32), nullable=False, server_default="system"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_entitlement_snapshots_user_id", "entitlement_snapshots", ["user_id"], unique=False)
        op.create_index(
            "ix_entitlement_snapshots_subscription_id",
            "entitlement_snapshots",
            ["subscription_id"],
            unique=False,
        )
        op.create_index(
            "ix_entitlement_snapshots_effective_plan_id",
            "entitlement_snapshots",
            ["effective_plan_id"],
            unique=False,
        )
        op.create_index(
            "ix_entitlement_snapshots_entitlement_status",
            "entitlement_snapshots",
            ["entitlement_status"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("entitlement_snapshots"):
        for index_name in (
            "ix_entitlement_snapshots_entitlement_status",
            "ix_entitlement_snapshots_effective_plan_id",
            "ix_entitlement_snapshots_subscription_id",
            "ix_entitlement_snapshots_user_id",
        ):
            op.drop_index(index_name, table_name="entitlement_snapshots")
        op.drop_table("entitlement_snapshots")
