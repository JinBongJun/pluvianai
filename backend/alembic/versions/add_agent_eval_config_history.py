"""Add agent_eval_config_history for time-based eval (apply config that was active at snapshot time).

Revision ID: add_eval_config_history
Revises: a91c4e7b2d10
Create Date: 2026-02-18

"""
from alembic import op
import sqlalchemy as sa


revision = "add_eval_config_history"
down_revision = "a91c4e7b2d10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_eval_config_history",
        sa.Column("id", sa.String(255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.String(64), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("eval_config", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_agent_eval_config_history_agent_id"),
        "agent_eval_config_history",
        ["agent_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_agent_eval_config_history_project_id"),
        "agent_eval_config_history",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_agent_eval_config_history_effective_from"),
        "agent_eval_config_history",
        ["effective_from"],
        unique=False,
    )
    op.create_index(
        "ix_agent_eval_config_history_project_agent_effective",
        "agent_eval_config_history",
        ["project_id", "agent_id", "effective_from"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_agent_eval_config_history_project_agent_effective", table_name="agent_eval_config_history")
    op.drop_index(op.f("ix_agent_eval_config_history_effective_from"), table_name="agent_eval_config_history")
    op.drop_index(op.f("ix_agent_eval_config_history_project_id"), table_name="agent_eval_config_history")
    op.drop_index(op.f("ix_agent_eval_config_history_agent_id"), table_name="agent_eval_config_history")
    op.drop_table("agent_eval_config_history")
