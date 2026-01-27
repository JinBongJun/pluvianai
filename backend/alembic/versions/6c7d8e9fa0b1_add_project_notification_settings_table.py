"""add_project_notification_settings_table

Revision ID: 6c7d8e9fa0b1
Revises: 5b6c7d8e9fa
Create Date: 2026-01-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '6c7d8e9fa0b1'
down_revision = '5b6c7d8e9fa'
branch_labels = None
depends_on = None


def upgrade():
    # Create project_notification_settings table
    op.create_table(
        'project_notification_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('email_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('slack_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('slack_webhook_url', sa.String(length=500), nullable=True),
        sa.Column('alert_types', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='["drift", "cost_spike", "error"]'),
        sa.Column('severity_threshold', sa.String(length=20), nullable=False, server_default='medium'),
        sa.Column('min_interval_minutes', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('quality_score_threshold', sa.Float(), nullable=True),
        sa.Column('error_rate_threshold', sa.Float(), nullable=True),
        sa.Column('drift_threshold', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_project_notification_settings_project_id'), 'project_notification_settings', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_notification_settings_user_id'), 'project_notification_settings', ['user_id'], unique=False)
    
    # Create unique constraint
    op.create_unique_constraint('uq_project_notification_settings_project_user', 'project_notification_settings', ['project_id', 'user_id'])


def downgrade():
    # Drop indexes and constraint
    op.drop_constraint('uq_project_notification_settings_project_user', 'project_notification_settings', type_='unique')
    op.drop_index(op.f('ix_project_notification_settings_user_id'), table_name='project_notification_settings')
    op.drop_index(op.f('ix_project_notification_settings_project_id'), table_name='project_notification_settings')
    
    # Drop table
    op.drop_table('project_notification_settings')
