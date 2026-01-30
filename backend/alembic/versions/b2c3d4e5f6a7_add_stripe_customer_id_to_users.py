"""add_stripe_customer_id_to_users

Revision ID: b2c3d4e5f6a7
Revises: 1d1641415d6e
Create Date: 2026-01-27 00:38:12.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = '1d1641415d6e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add stripe_customer_id field to users table
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('stripe_customer_id', sa.String(length=255), nullable=True))
        batch_op.create_index('ix_users_stripe_customer_id', ['stripe_customer_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(op.f('ix_users_stripe_customer_id'))
        batch_op.drop_column('stripe_customer_id')
