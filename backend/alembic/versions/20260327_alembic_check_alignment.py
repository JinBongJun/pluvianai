"""Drop legacy test_lab_canvases; validation_datasets comments + tag index.

- test_lab_canvases exists on DBs that ran 5e5a bootstrap but has no ORM model.
- validation_datasets: add PostgreSQL column comments and ix_validation_datasets_tag to match models.

Revision ID: 20260327_alembic_check
Revises: 20260326_reconcile_orm
Create Date: 2026-03-27
"""

from alembic import op
import sqlalchemy as sa

revision = "20260327_alembic_check"
down_revision = "20260326_reconcile_orm"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("test_lab_canvases"):
        for ix in (
            "ix_test_lab_canvases_created_at",
            "ix_test_lab_canvases_id",
            "ix_test_lab_canvases_project_id",
        ):
            if ix in {i["name"] for i in insp.get_indexes("test_lab_canvases")}:
                op.drop_index(ix, table_name="test_lab_canvases")
        op.drop_table("test_lab_canvases")

    if insp.has_table("validation_datasets"):
        vix = {i["name"] for i in insp.get_indexes("validation_datasets")}
        if "ix_validation_datasets_tag" not in vix:
            op.create_index(
                "ix_validation_datasets_tag",
                "validation_datasets",
                ["tag"],
                unique=False,
            )
        op.execute(
            sa.text(
                "COMMENT ON COLUMN validation_datasets.trace_ids IS "
                "'List of trace IDs in this dataset'"
            )
        )
        op.execute(
            sa.text(
                "COMMENT ON COLUMN validation_datasets.snapshot_ids IS "
                "'List of snapshot IDs in this dataset'"
            )
        )
        op.execute(
            sa.text(
                "COMMENT ON COLUMN validation_datasets.eval_config_snapshot IS "
                "'Eval/diagnostic config version or snapshot'"
            )
        )
        op.execute(
            sa.text(
                "COMMENT ON COLUMN validation_datasets.policy_ruleset_snapshot IS "
                "'Rule snapshot: [{id, revision, rule_json}, ...]'"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("validation_datasets"):
        vix = {i["name"] for i in insp.get_indexes("validation_datasets")}
        if "ix_validation_datasets_tag" in vix:
            op.drop_index("ix_validation_datasets_tag", table_name="validation_datasets")
        op.execute(
            sa.text("COMMENT ON COLUMN validation_datasets.trace_ids IS NULL")
        )
        op.execute(
            sa.text("COMMENT ON COLUMN validation_datasets.snapshot_ids IS NULL")
        )
        op.execute(
            sa.text(
                "COMMENT ON COLUMN validation_datasets.eval_config_snapshot IS NULL"
            )
        )
        op.execute(
            sa.text(
                "COMMENT ON COLUMN validation_datasets.policy_ruleset_snapshot IS NULL"
            )
        )

    if not insp.has_table("test_lab_canvases"):
        op.create_table(
            "test_lab_canvases",
            sa.Column("id", sa.String(length=255), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("boxes", sa.JSON(), nullable=True),
            sa.Column("connections", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_test_lab_canvases_created_at",
            "test_lab_canvases",
            ["created_at"],
            unique=False,
        )
        op.create_index(
            "ix_test_lab_canvases_id",
            "test_lab_canvases",
            ["id"],
            unique=False,
        )
        op.create_index(
            "ix_test_lab_canvases_project_id",
            "test_lab_canvases",
            ["project_id"],
            unique=False,
        )
