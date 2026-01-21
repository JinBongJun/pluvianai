"""add organizations and organization_members

Revision ID: add_organizations_20260121
Revises: 
Create Date: 2026-01-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_organizations_20260121"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  # Organizations table
  op.create_table(
      "organizations",
      sa.Column("id", sa.Integer(), primary_key=True),
      sa.Column("name", sa.String(length=255), nullable=False),
      sa.Column("type", sa.String(length=50), nullable=True),
      sa.Column("plan_type", sa.String(length=20), nullable=False, server_default="free"),
      sa.Column("paddle_customer_id", sa.String(length=255), nullable=True),
      sa.Column("paddle_subscription_id", sa.String(length=255), nullable=True),
      sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
      sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
      sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
  )

  # Organization members
  op.create_table(
      "organization_members",
      sa.Column("id", sa.Integer(), primary_key=True),
      sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
      sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
      sa.Column("role", sa.String(length=20), nullable=False, server_default="owner"),
      sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
  )

  # Project → Organization relation (nullable for now)
  with op.batch_alter_table("projects") as batch_op:
    batch_op.add_column(
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True, index=True)
    )


def downgrade() -> None:
  with op.batch_alter_table("projects") as batch_op:
    batch_op.drop_column("organization_id")
  op.drop_table("organization_members")

  op.drop_table("organizations")

