"""update_subscriptions_schema

Revision ID: 67fc79a64a2d
Revises: c3b29e1fa014
Create Date: 2026-02-15 21:45:22.892102

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '67fc79a64a2d'
down_revision = 'c3b29e1fa014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new Stripe-related columns
    op.add_column('subscriptions', sa.Column('stripe_subscription_id', sa.String(length=255), nullable=True))
    op.add_column('subscriptions', sa.Column('plan_id', sa.String(length=50), nullable=False, server_default='free'))
    
    # Add index for stripe_subscription_id
    op.create_index(op.f('ix_subscriptions_stripe_subscription_id'), 'subscriptions', ['stripe_subscription_id'], unique=False)


def downgrade() -> None:
    # Remove added columns
    op.drop_index(op.f('ix_subscriptions_stripe_subscription_id'), table_name='subscriptions')
    op.drop_column('subscriptions', 'plan_id')
    op.drop_column('subscriptions', 'stripe_subscription_id')
