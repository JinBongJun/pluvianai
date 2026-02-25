"""add_validation_datasets_table

Revision ID: 20260217vd
Revises: f34a9c1d2e7b
Create Date: 2026-02-17

"""

from alembic import op
import sqlalchemy as sa


revision = "20260217vd"
down_revision = "f34a9c1d2e7b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "validation_datasets",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.String(length=100), nullable=True),
        sa.Column("trace_ids", sa.JSON(), nullable=True),
        sa.Column("snapshot_ids", sa.JSON(), nullable=True),
        sa.Column("eval_config_snapshot", sa.JSON(), nullable=True),
        sa.Column("policy_ruleset_snapshot", sa.JSON(), nullable=True),
        sa.Column("ruleset_hash", sa.String(length=64), nullable=True),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("tag", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_validation_datasets_id"), "validation_datasets", ["id"], unique=False)
    op.create_index(op.f("ix_validation_datasets_project_id"), "validation_datasets", ["project_id"], unique=False)
    op.create_index(op.f("ix_validation_datasets_agent_id"), "validation_datasets", ["agent_id"], unique=False)
    op.create_index(op.f("ix_validation_datasets_ruleset_hash"), "validation_datasets", ["ruleset_hash"], unique=False)
    op.create_index(op.f("ix_validation_datasets_label"), "validation_datasets", ["label"], unique=False)
    op.create_index(op.f("ix_validation_datasets_created_at"), "validation_datasets", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_validation_datasets_created_at"), table_name="validation_datasets")
    op.drop_index(op.f("ix_validation_datasets_label"), table_name="validation_datasets")
    op.drop_index(op.f("ix_validation_datasets_ruleset_hash"), table_name="validation_datasets")
    op.drop_index(op.f("ix_validation_datasets_agent_id"), table_name="validation_datasets")
    op.drop_index(op.f("ix_validation_datasets_project_id"), table_name="validation_datasets")
    op.drop_index(op.f("ix_validation_datasets_id"), table_name="validation_datasets")
    op.drop_table("validation_datasets")
