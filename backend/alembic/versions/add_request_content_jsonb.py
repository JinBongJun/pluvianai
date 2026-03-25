"""add request_content jsonb to snapshots

Revision ID: add_request_content_jsonb
Revises: previous_revision_id
Create Date: 2026-02-07 20:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_request_content_jsonb'
down_revision = "896063a36393"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add request_content column (JSONB)
    op.add_column('snapshots', sa.Column('request_content', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    
    # 2. Migrate existing data (Text -> JSONB)
    # Convert simple text prompt to OpenAI message structure
    # 2. Migrate existing data (Text -> JSONB) - SKIPPED for Railway Migration
    # Old column 'user_message' does not exist in new DB, so we cannot migrate data.
    # New data will be populated correctly by application logic.
    pass

def downgrade():
    op.drop_column('snapshots', 'request_content')
