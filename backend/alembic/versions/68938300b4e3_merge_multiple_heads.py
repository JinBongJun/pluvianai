"""Merge multiple heads

Revision ID: 68938300b4e3
Revises: a19b3ccff33d, add_request_content_jsonb
Create Date: 2026-02-15 18:36:41.152896

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '68938300b4e3'
down_revision = ('a19b3ccff33d', 'add_request_content_jsonb')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
