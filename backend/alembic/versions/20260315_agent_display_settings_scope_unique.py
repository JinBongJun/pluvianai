"""Scope agent_display_settings uniqueness by project.

Revision ID: 20260315_agent_setting_scope_uq
Revises: 20260315_key_hint
Create Date: 2026-03-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260315_agent_setting_scope_uq"
down_revision = "20260315_key_hint"
branch_labels = None
depends_on = None


OLD_CONSTRAINT = "uq_agent_display_settings_system_prompt_hash"
NEW_CONSTRAINT = "uq_agent_display_settings_project_system_prompt_hash"


def _unique_names(bind) -> set[str]:
    inspector = sa.inspect(bind)
    if not inspector.has_table("agent_display_settings"):
        return set()
    return {c.get("name") for c in inspector.get_unique_constraints("agent_display_settings") if c.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    names = _unique_names(bind)
    if not names:
        return

    with op.batch_alter_table("agent_display_settings") as batch_op:
        if OLD_CONSTRAINT in names:
            batch_op.drop_constraint(OLD_CONSTRAINT, type_="unique")
        if NEW_CONSTRAINT not in names:
            batch_op.create_unique_constraint(NEW_CONSTRAINT, ["project_id", "system_prompt_hash"])


def downgrade() -> None:
    bind = op.get_bind()
    names = _unique_names(bind)
    if not names:
        return

    duplicate = bind.execute(
        sa.text(
            """
            SELECT system_prompt_hash
            FROM agent_display_settings
            GROUP BY system_prompt_hash
            HAVING COUNT(*) > 1
            LIMIT 1
            """
        )
    ).first()
    if duplicate:
        raise RuntimeError(
            "Cannot downgrade: duplicate system_prompt_hash rows exist across projects."
        )

    with op.batch_alter_table("agent_display_settings") as batch_op:
        if NEW_CONSTRAINT in names:
            batch_op.drop_constraint(NEW_CONSTRAINT, type_="unique")
        if OLD_CONSTRAINT not in names:
            batch_op.create_unique_constraint(OLD_CONSTRAINT, ["system_prompt_hash"])
