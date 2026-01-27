"""add_judge_feedback_table

Revision ID: 5b6c7d8e9fa
Revises: 4a5b6c7d8e9f
Create Date: 2026-01-26 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '5b6c7d8e9fa'
down_revision = '4a5b6c7d8e9f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Judge Feedback table
    op.create_table(
        'judge_feedback',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('evaluation_id', sa.Integer(), nullable=False),
        sa.Column('judge_score', sa.Float(), nullable=False),
        sa.Column('human_score', sa.Float(), nullable=False),
        sa.Column('alignment_score', sa.Float(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('correction_reason', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['evaluation_id'], ['quality_scores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_judge_feedback_id'), 'judge_feedback', ['id'], unique=False)
    op.create_index(op.f('ix_judge_feedback_project_id'), 'judge_feedback', ['project_id'], unique=False)
    op.create_index(op.f('ix_judge_feedback_evaluation_id'), 'judge_feedback', ['evaluation_id'], unique=False)
    op.create_index(op.f('ix_judge_feedback_created_at'), 'judge_feedback', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_judge_feedback_created_at'), table_name='judge_feedback')
    op.drop_index(op.f('ix_judge_feedback_evaluation_id'), table_name='judge_feedback')
    op.drop_index(op.f('ix_judge_feedback_project_id'), table_name='judge_feedback')
    op.drop_index(op.f('ix_judge_feedback_id'), table_name='judge_feedback')
    op.drop_table('judge_feedback')
