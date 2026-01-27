"""add_pii_patterns_table

Revision ID: 3d76fd2727c9
Revises: cc72308b5ff8
Create Date: 2026-01-26 00:30:13.958201

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3d76fd2727c9'
down_revision = 'cc72308b5ff8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PII Patterns table
    op.create_table(
        'pii_patterns',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('pattern', sa.Text(), nullable=False),
        sa.Column('replacement', sa.String(length=255), nullable=True, server_default='[REDACTED]'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pii_patterns_id'), 'pii_patterns', ['id'], unique=False)
    op.create_index(op.f('ix_pii_patterns_project_id'), 'pii_patterns', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_pii_patterns_project_id'), table_name='pii_patterns')
    op.drop_index(op.f('ix_pii_patterns_id'), table_name='pii_patterns')
    op.drop_table('pii_patterns')
