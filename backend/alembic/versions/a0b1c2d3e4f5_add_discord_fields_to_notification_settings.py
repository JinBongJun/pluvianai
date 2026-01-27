"""add_discord_fields_to_notification_settings

Revision ID: a0b1c2d3e4f5
Revises: 9f0a1b2c3d4e
Create Date: 2026-01-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a0b1c2d3e4f5'
down_revision = '9f0a1b2c3d4e'
branch_labels = None
depends_on = None


def upgrade():
    # Add Discord fields to project_notification_settings table
    op.add_column('project_notification_settings', sa.Column('discord_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('project_notification_settings', sa.Column('discord_webhook_url', sa.String(length=500), nullable=True))


def downgrade():
    # Remove Discord fields
    op.drop_column('project_notification_settings', 'discord_webhook_url')
    op.drop_column('project_notification_settings', 'discord_enabled')
