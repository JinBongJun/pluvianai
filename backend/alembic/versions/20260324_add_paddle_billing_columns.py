"""Add Paddle Billing columns (customer / subscription ids).

Revision ID: 20260324_paddle_cols
Revises: 20260321_traj_pr_tr_src
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260324_paddle_cols"
down_revision = "20260321_traj_pr_tr_src"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("users"):
        cols = {c["name"] for c in insp.get_columns("users")}
        if "paddle_customer_id" not in cols:
            with op.batch_alter_table("users") as batch:
                batch.add_column(sa.Column("paddle_customer_id", sa.String(255), nullable=True))
                batch.create_index("ix_users_paddle_customer_id", ["paddle_customer_id"], unique=False)

    if insp.has_table("subscriptions"):
        cols = {c["name"] for c in insp.get_columns("subscriptions")}
        with op.batch_alter_table("subscriptions") as batch:
            if "paddle_subscription_id" not in cols:
                batch.add_column(sa.Column("paddle_subscription_id", sa.String(255), nullable=True))
                batch.create_index(
                    "ix_subscriptions_paddle_subscription_id",
                    ["paddle_subscription_id"],
                    unique=False,
                )
            if "paddle_customer_id" not in cols:
                batch.add_column(sa.Column("paddle_customer_id", sa.String(255), nullable=True))
                batch.create_index(
                    "ix_subscriptions_paddle_customer_id",
                    ["paddle_customer_id"],
                    unique=False,
                )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("subscriptions"):
        cols = {c["name"] for c in insp.get_columns("subscriptions")}
        with op.batch_alter_table("subscriptions") as batch:
            if "paddle_customer_id" in cols:
                batch.drop_index("ix_subscriptions_paddle_customer_id")
                batch.drop_column("paddle_customer_id")
            if "paddle_subscription_id" in cols:
                batch.drop_index("ix_subscriptions_paddle_subscription_id")
                batch.drop_column("paddle_subscription_id")

    if insp.has_table("users"):
        cols = {c["name"] for c in insp.get_columns("users")}
        if "paddle_customer_id" in cols:
            with op.batch_alter_table("users") as batch:
                batch.drop_index("ix_users_paddle_customer_id")
                batch.drop_column("paddle_customer_id")
