"""merge api_keys_scope and agent_deleted_at heads

Revision ID: efeaf96c4b84
Revises: 20260317_agent_deleted_at, 20260315_api_keys_scope
Create Date: 2026-03-17 16:45:17.121233

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'efeaf96c4b84'
down_revision = ('20260317_agent_deleted_at', '20260315_api_keys_scope')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
