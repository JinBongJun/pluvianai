"""Add signal detection, worst prompts, and review tables

Revision ID: d1e2f3g4h5i6
Revises: 
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd1e2f3g4h5i6'
down_revision = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Signal Detections table
    op.create_table(
        'signal_detections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('snapshot_id', sa.Integer(), nullable=True),
        sa.Column('signal_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), server_default='medium'),
        sa.Column('detected', sa.Boolean(), server_default='false'),
        sa.Column('confidence', sa.Float(), server_default='0.0'),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('custom_signal_name', sa.String(255), nullable=True),
        sa.Column('custom_signal_rule', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['snapshots.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_signal_detections_id', 'signal_detections', ['id'])
    op.create_index('ix_signal_detections_project_id', 'signal_detections', ['project_id'])
    op.create_index('ix_signal_detections_snapshot_id', 'signal_detections', ['snapshot_id'])
    op.create_index('ix_signal_detections_signal_type', 'signal_detections', ['signal_type'])
    op.create_index('ix_signal_detections_created_at', 'signal_detections', ['created_at'])

    # Signal Configs table
    op.create_table(
        'signal_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('signal_type', sa.String(50), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(1000), nullable=True),
        sa.Column('enabled', sa.Boolean(), server_default='true'),
        sa.Column('threshold', sa.Float(), server_default='0.5'),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('custom_rule', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_signal_configs_id', 'signal_configs', ['id'])
    op.create_index('ix_signal_configs_project_id', 'signal_configs', ['project_id'])

    # Worst Prompts table
    op.create_table(
        'worst_prompts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('snapshot_id', sa.Integer(), nullable=True),
        sa.Column('prompt_text', sa.Text(), nullable=False),
        sa.Column('context', sa.JSON(), nullable=True),
        sa.Column('reason', sa.String(50), nullable=False),
        sa.Column('severity_score', sa.Float(), server_default='0.5'),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('provider', sa.String(50), nullable=True),
        sa.Column('original_response', sa.Text(), nullable=True),
        sa.Column('response_metadata', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('is_reviewed', sa.Boolean(), server_default='false'),
        sa.Column('cluster_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['snapshots.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_worst_prompts_id', 'worst_prompts', ['id'])
    op.create_index('ix_worst_prompts_project_id', 'worst_prompts', ['project_id'])
    op.create_index('ix_worst_prompts_snapshot_id', 'worst_prompts', ['snapshot_id'])
    op.create_index('ix_worst_prompts_reason', 'worst_prompts', ['reason'])
    op.create_index('ix_worst_prompts_cluster_id', 'worst_prompts', ['cluster_id'])
    op.create_index('ix_worst_prompts_created_at', 'worst_prompts', ['created_at'])

    # Worst Prompt Sets table
    op.create_table(
        'worst_prompt_sets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('auto_collect', sa.Boolean(), server_default='true'),
        sa.Column('max_prompts', sa.Integer(), server_default='100'),
        sa.Column('collection_criteria', sa.JSON(), nullable=True),
        sa.Column('prompt_count', sa.Integer(), server_default='0'),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_worst_prompt_sets_id', 'worst_prompt_sets', ['id'])
    op.create_index('ix_worst_prompt_sets_project_id', 'worst_prompt_sets', ['project_id'])

    # Worst Prompt Set Members table
    op.create_table(
        'worst_prompt_set_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('prompt_set_id', sa.Integer(), nullable=False),
        sa.Column('worst_prompt_id', sa.Integer(), nullable=False),
        sa.Column('order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['prompt_set_id'], ['worst_prompt_sets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['worst_prompt_id'], ['worst_prompts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_worst_prompt_set_members_id', 'worst_prompt_set_members', ['id'])
    op.create_index('ix_worst_prompt_set_members_prompt_set_id', 'worst_prompt_set_members', ['prompt_set_id'])
    op.create_index('ix_worst_prompt_set_members_worst_prompt_id', 'worst_prompt_set_members', ['worst_prompt_id'])

    # Reviews table
    op.create_table(
        'reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('replay_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('regression_status', sa.String(20), server_default='pending'),
        sa.Column('signals_detected', sa.JSON(), nullable=True),
        sa.Column('affected_cases', sa.Integer(), server_default='0'),
        sa.Column('reviewer_id', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decision', sa.String(50), nullable=True),
        sa.Column('decision_note', sa.Text(), nullable=True),
        sa.Column('model_before', sa.String(100), nullable=True),
        sa.Column('model_after', sa.String(100), nullable=True),
        sa.Column('test_count', sa.Integer(), server_default='0'),
        sa.Column('passed_count', sa.Integer(), server_default='0'),
        sa.Column('failed_count', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reviews_id', 'reviews', ['id'])
    op.create_index('ix_reviews_project_id', 'reviews', ['project_id'])
    op.create_index('ix_reviews_replay_id', 'reviews', ['replay_id'])
    op.create_index('ix_reviews_status', 'reviews', ['status'])
    op.create_index('ix_reviews_regression_status', 'reviews', ['regression_status'])
    op.create_index('ix_reviews_created_at', 'reviews', ['created_at'])

    # Review Comments table
    op.create_table(
        'review_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('review_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_system', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['review_id'], ['reviews.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_review_comments_id', 'review_comments', ['id'])
    op.create_index('ix_review_comments_review_id', 'review_comments', ['review_id'])

    # Review Cases table
    op.create_table(
        'review_cases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('review_id', sa.Integer(), nullable=False),
        sa.Column('snapshot_id', sa.Integer(), nullable=True),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('response_before', sa.Text(), nullable=True),
        sa.Column('response_after', sa.Text(), nullable=True),
        sa.Column('signals', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('manually_reviewed', sa.Boolean(), server_default='false'),
        sa.Column('manual_status', sa.String(20), nullable=True),
        sa.Column('reviewer_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['review_id'], ['reviews.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['snapshots.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_review_cases_id', 'review_cases', ['id'])
    op.create_index('ix_review_cases_review_id', 'review_cases', ['review_id'])
    op.create_index('ix_review_cases_snapshot_id', 'review_cases', ['snapshot_id'])


def downgrade() -> None:
    op.drop_table('review_cases')
    op.drop_table('review_comments')
    op.drop_table('reviews')
    op.drop_table('worst_prompt_set_members')
    op.drop_table('worst_prompt_sets')
    op.drop_table('worst_prompts')
    op.drop_table('signal_configs')
    op.drop_table('signal_detections')
