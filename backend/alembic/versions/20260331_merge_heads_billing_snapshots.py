"""merge billing and snapshot index heads

Revision ID: 20260331_merge_heads
Revises: 20260330_snapshots_lv_ix, 20260331_entitlement_snapshots
Create Date: 2026-03-31

"""


# revision identifiers, used by Alembic.
revision = "20260331_merge_heads"
down_revision = ("20260330_snapshots_lv_ix", "20260331_entitlement_snapshots")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
