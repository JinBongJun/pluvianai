"""Re-add api_calls.chain_id for SDK ingest / trace grouping.

Model APICall.chain_id exists; some DBs reached Alembic head without this column
after historical migrations dropped it. Idempotent add.

Revision ID: 20260325_api_calls_chain_id
Revises: 20260324_paddle_cols
Create Date: 2026-03-25
"""

from alembic import op
import sqlalchemy as sa


revision = "20260325_api_calls_chain_id"
down_revision = "20260324_paddle_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("api_calls"):
        return

    cols = {c["name"] for c in insp.get_columns("api_calls")}
    if "chain_id" in cols:
        return

    with op.batch_alter_table("api_calls") as batch:
        batch.add_column(sa.Column("chain_id", sa.String(length=255), nullable=True))
        batch.create_index("ix_api_calls_chain_id", ["chain_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("api_calls"):
        return

    cols = {c["name"] for c in insp.get_columns("api_calls")}
    if "chain_id" not in cols:
        return

    with op.batch_alter_table("api_calls") as batch:
        batch.drop_index("ix_api_calls_chain_id")
        batch.drop_column("chain_id")
