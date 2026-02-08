"""Merge multiple heads

Revision ID: a19b3ccff33d
Revises: 20260207_org_description, b2c3d4e5f6a7
Create Date: 2026-02-07 00:20:57.687977

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a19b3ccff33d'
down_revision = ('20260207_org_description', 'b2c3d4e5f6a7')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
