"""add_public_benchmarks_table

Revision ID: 8e9fa0b1c2d3
Revises: 7d8e9fa0b1c2
Create Date: 2026-01-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '8e9fa0b1c2d3'
down_revision = '7d8e9fa0b1c2'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table("public_benchmarks"):
        return
    # Create public_benchmarks table
    op.create_table(
        'public_benchmarks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('benchmark_type', sa.String(length=50), nullable=False),
        sa.Column('benchmark_data', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('test_cases_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('is_featured', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_approved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_public_benchmarks_id'), 'public_benchmarks', ['id'], unique=False)
    op.create_index(op.f('ix_public_benchmarks_author_id'), 'public_benchmarks', ['author_id'], unique=False)
    op.create_index(op.f('ix_public_benchmarks_benchmark_type'), 'public_benchmarks', ['benchmark_type'], unique=False)
    op.create_index(op.f('ix_public_benchmarks_category'), 'public_benchmarks', ['category'], unique=False)
    op.create_index(op.f('ix_public_benchmarks_is_featured'), 'public_benchmarks', ['is_featured'], unique=False)
    op.create_index(op.f('ix_public_benchmarks_is_approved'), 'public_benchmarks', ['is_approved'], unique=False)
    op.create_index(op.f('ix_public_benchmarks_created_at'), 'public_benchmarks', ['created_at'], unique=False)
    
    # Create composite indexes
    op.create_index('ix_public_benchmark_category_approved', 'public_benchmarks', ['category', 'is_approved'], unique=False)
    op.create_index('ix_public_benchmark_featured_approved', 'public_benchmarks', ['is_featured', 'is_approved'], unique=False)


def downgrade():
    # Drop indexes
    op.drop_index('ix_public_benchmark_featured_approved', table_name='public_benchmarks')
    op.drop_index('ix_public_benchmark_category_approved', table_name='public_benchmarks')
    op.drop_index(op.f('ix_public_benchmarks_created_at'), table_name='public_benchmarks')
    op.drop_index(op.f('ix_public_benchmarks_is_approved'), table_name='public_benchmarks')
    op.drop_index(op.f('ix_public_benchmarks_is_featured'), table_name='public_benchmarks')
    op.drop_index(op.f('ix_public_benchmarks_category'), table_name='public_benchmarks')
    op.drop_index(op.f('ix_public_benchmarks_benchmark_type'), table_name='public_benchmarks')
    op.drop_index(op.f('ix_public_benchmarks_author_id'), table_name='public_benchmarks')
    op.drop_index(op.f('ix_public_benchmarks_id'), table_name='public_benchmarks')
    
    # Drop table
    op.drop_table('public_benchmarks')
