"""add_rule_market_table

Revision ID: 7d8e9fa0b1c2
Revises: 6c7d8e9fa0b1
Create Date: 2026-01-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '7d8e9fa0b1c2'
down_revision = '6c7d8e9fa0b1'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table("rule_market"):
        return
    # Create rule_market table
    op.create_table(
        'rule_market',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('rule_type', sa.String(length=50), nullable=False),
        sa.Column('pattern', sa.Text(), nullable=False),
        sa.Column('pattern_type', sa.String(length=50), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rating', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('rating_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_approved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_featured', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_rule_market_id'), 'rule_market', ['id'], unique=False)
    op.create_index(op.f('ix_rule_market_author_id'), 'rule_market', ['author_id'], unique=False)
    op.create_index(op.f('ix_rule_market_rule_type'), 'rule_market', ['rule_type'], unique=False)
    op.create_index(op.f('ix_rule_market_category'), 'rule_market', ['category'], unique=False)
    op.create_index(op.f('ix_rule_market_is_approved'), 'rule_market', ['is_approved'], unique=False)
    op.create_index(op.f('ix_rule_market_is_featured'), 'rule_market', ['is_featured'], unique=False)
    op.create_index(op.f('ix_rule_market_created_at'), 'rule_market', ['created_at'], unique=False)
    
    # Create composite indexes
    op.create_index('ix_rule_market_category_approved', 'rule_market', ['category', 'is_approved'], unique=False)
    op.create_index('ix_rule_market_featured_approved', 'rule_market', ['is_featured', 'is_approved'], unique=False)


def downgrade():
    # Drop indexes
    op.drop_index('ix_rule_market_featured_approved', table_name='rule_market')
    op.drop_index('ix_rule_market_category_approved', table_name='rule_market')
    op.drop_index(op.f('ix_rule_market_created_at'), table_name='rule_market')
    op.drop_index(op.f('ix_rule_market_is_featured'), table_name='rule_market')
    op.drop_index(op.f('ix_rule_market_is_approved'), table_name='rule_market')
    op.drop_index(op.f('ix_rule_market_category'), table_name='rule_market')
    op.drop_index(op.f('ix_rule_market_rule_type'), table_name='rule_market')
    op.drop_index(op.f('ix_rule_market_author_id'), table_name='rule_market')
    op.drop_index(op.f('ix_rule_market_id'), table_name='rule_market')
    
    # Drop table
    op.drop_table('rule_market')
