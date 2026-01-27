"""add_firewall_rules_table

Revision ID: 4a5b6c7d8e9f
Revises: 3d76fd2727c9
Create Date: 2026-01-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '4a5b6c7d8e9f'
down_revision = '3d76fd2727c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Firewall Rules table
    op.create_table(
        'firewall_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('rule_type', sa.Enum('pii', 'toxicity', 'hallucination', 'custom', name='firewallruletype'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('pattern', sa.Text(), nullable=True),
        sa.Column('pattern_type', sa.String(length=50), nullable=True),
        sa.Column('action', sa.Enum('block', 'warn', 'log', name='firewallaction'), nullable=False, server_default='block'),
        sa.Column('severity', sa.Enum('low', 'medium', 'high', 'critical', name='firewallseverity'), nullable=False, server_default='medium'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('config', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_firewall_rules_id'), 'firewall_rules', ['id'], unique=False)
    op.create_index(op.f('ix_firewall_rules_project_id'), 'firewall_rules', ['project_id'], unique=False)
    op.create_index(op.f('ix_firewall_rules_rule_type'), 'firewall_rules', ['rule_type'], unique=False)
    op.create_index(op.f('ix_firewall_rules_enabled'), 'firewall_rules', ['enabled'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_firewall_rules_enabled'), table_name='firewall_rules')
    op.drop_index(op.f('ix_firewall_rules_rule_type'), table_name='firewall_rules')
    op.drop_index(op.f('ix_firewall_rules_project_id'), table_name='firewall_rules')
    op.drop_index(op.f('ix_firewall_rules_id'), table_name='firewall_rules')
    op.drop_table('firewall_rules')
    # Drop enums
    sa.Enum(name='firewallseverity').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='firewallaction').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='firewallruletype').drop(op.get_bind(), checkfirst=True)
