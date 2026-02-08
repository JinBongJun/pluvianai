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
down_revision = None  # We will need to check the current head
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add request_content column (JSONB)
    op.add_column('snapshots', sa.Column('request_content', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    
    # 2. Migrate existing data (Text -> JSONB)
    # Convert simple text prompt to OpenAI message structure
    op.execute("""
        UPDATE snapshots 
        SET request_content = jsonb_build_object(
            'messages', jsonb_build_array(
                jsonb_build_object(
                    'role', 'user', 
                    'content', CASE 
                        WHEN user_message IS NOT NULL THEN user_message 
                        ELSE '' 
                    END
                )
            )
        )
        WHERE user_message IS NOT NULL AND request_content IS NULL
    """)

def downgrade():
    op.drop_column('snapshots', 'request_content')
