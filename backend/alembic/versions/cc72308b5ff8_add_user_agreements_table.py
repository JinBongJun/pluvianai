"""add_user_agreements_table

Revision ID: cc72308b5ff8
Revises: 9d03a6df169d
Create Date: 2026-01-26 00:29:57.553576

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cc72308b5ff8'
down_revision = '9d03a6df169d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # User Agreements table
    op.create_table(
        'user_agreements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('liability_agreement_accepted', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('liability_agreement_accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('terms_of_service_accepted', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('terms_of_service_accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('privacy_policy_accepted', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('privacy_policy_accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_user_agreements_id'), 'user_agreements', ['id'], unique=False)
    op.create_index(op.f('ix_user_agreements_user_id'), 'user_agreements', ['user_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_agreements_user_id'), table_name='user_agreements')
    op.drop_index(op.f('ix_user_agreements_id'), table_name='user_agreements')
    op.drop_table('user_agreements')
