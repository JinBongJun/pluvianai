"""Add usage_mode to projects (Design 5.1.5: Full Mode / Test Only)."""

from alembic import op
import sqlalchemy as sa

revision = "20260206_usage_mode"
down_revision = "20260205_phase1_schema_alignment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("usage_mode", sa.String(32), server_default="full", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("projects", "usage_mode")
