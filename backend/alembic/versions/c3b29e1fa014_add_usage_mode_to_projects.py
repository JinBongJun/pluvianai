"""add_usage_mode_to_projects

Revision ID: c3b29e1fa014
Revises: 68938300b4e3
Create Date: 2026-02-15 21:38:05.485204

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c3b29e1fa014'
down_revision = '68938300b4e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Manually cleaned to only add usage_mode
    op.add_column('projects', sa.Column('usage_mode', sa.String(length=32), nullable=False, server_default='full'))


def downgrade() -> None:
    # Manually cleaned
    op.drop_column('projects', 'usage_mode')
