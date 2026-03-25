"""Drop redundant ix_validation_datasets_id (PK already indexes id).

20260217_add_validation_datasets_table created a separate index on id; the ORM
uses primary_key only. Alembic check expects no duplicate index.

Revision ID: 20260328_drop_validation_id_ix
Revises: 20260327_alembic_check
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa

revision = "20260328_drop_validation_id_ix"
down_revision = "20260327_alembic_check"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("validation_datasets"):
        return
    names = {i["name"] for i in insp.get_indexes("validation_datasets")}
    ix = op.f("ix_validation_datasets_id")
    if ix in names:
        op.drop_index(ix, table_name="validation_datasets")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("validation_datasets"):
        return
    names = {i["name"] for i in insp.get_indexes("validation_datasets")}
    ix = op.f("ix_validation_datasets_id")
    if ix not in names:
        op.create_index(ix, "validation_datasets", ["id"], unique=False)
