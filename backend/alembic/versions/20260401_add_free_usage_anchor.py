"""add free usage anchor to subscriptions

Revision ID: 20260401_free_usage_anchor
Revises: 20260401_google_auth
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_free_usage_anchor"
down_revision = "20260401_google_auth"
branch_labels = None
depends_on = None


def _has_column(insp: sa.Inspector, table_name: str, column_name: str) -> bool:
    return column_name in {c["name"] for c in insp.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("subscriptions"):
        return

    if not _has_column(insp, "subscriptions", "free_usage_anchor_at"):
        op.add_column(
            "subscriptions",
            sa.Column("free_usage_anchor_at", sa.DateTime(timezone=True), nullable=True),
        )

    subscriptions = sa.table(
        "subscriptions",
        sa.column("id", sa.Integer()),
        sa.column("plan_id", sa.String()),
        sa.column("current_period_start", sa.DateTime(timezone=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("free_usage_anchor_at", sa.DateTime(timezone=True)),
    )

    rows = bind.execute(
        sa.select(
            subscriptions.c.id,
            subscriptions.c.current_period_start,
            subscriptions.c.created_at,
            subscriptions.c.plan_id,
        ).where(
            subscriptions.c.free_usage_anchor_at.is_(None),
            subscriptions.c.plan_id == "free",
        )
    ).fetchall()

    for row in rows:
        anchor = row.current_period_start or row.created_at
        if anchor is None:
            continue
        bind.execute(
            sa.update(subscriptions)
            .where(subscriptions.c.id == row.id)
            .values(free_usage_anchor_at=anchor)
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("subscriptions") and _has_column(insp, "subscriptions", "free_usage_anchor_at"):
        op.drop_column("subscriptions", "free_usage_anchor_at")
