"""add_referral_fields_to_users

Revision ID: 1d1641415d6e
Revises: 3d76fd2727c9
Create Date: 2026-01-26 00:30:18.533289

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1d1641415d6e'
down_revision = '3d76fd2727c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add referral fields to users table
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('referral_code', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('referral_credits', sa.Integer(), nullable=True, server_default='0'))
        batch_op.add_column(sa.Column('referred_by', sa.Integer(), nullable=True))
        batch_op.create_index('ix_users_referral_code', ['referral_code'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(op.f('ix_users_referral_code'))
        batch_op.drop_column('referred_by')
        batch_op.drop_column('referral_credits')
        batch_op.drop_column('referral_code')
