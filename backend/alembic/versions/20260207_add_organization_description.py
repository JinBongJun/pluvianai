"""Add description to organizations (replace type in create form)."""

from alembic import op
import sqlalchemy as sa

revision = "20260207_org_description"
down_revision = "20260206_usage_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("description", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "description")
