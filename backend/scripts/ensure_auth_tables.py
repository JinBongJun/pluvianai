
import sys
import os
from sqlalchemy import text
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.append(str(PROJECT_ROOT))

from app.core.database import engine, SessionLocal
from app.core.logging_config import logger

def ensure_tables():
    sql = """
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT idx_refresh_token_hash UNIQUE (token_hash)
    );
    
    CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens (user_id);
    CREATE INDEX IF NOT EXISTS ix_refresh_tokens_token_hash ON refresh_tokens (token_hash);
    CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at ON refresh_tokens (expires_at);
    """
    
    try:
        with engine.begin() as conn:
            print("🔄 Ensuring refresh_tokens table exists...")
            conn.execute(text(sql))
            print("✅ refresh_tokens table ensured.")
            
            # Check if other critical tables exist
            result = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
            tables = [row[0] for row in result]
            print(f"📋 Current tables: {', '.join(tables)}")
            
    except Exception as e:
        print(f"❌ Error ensuring tables: {e}")
        sys.exit(1)

if __name__ == "__main__":
    ensure_tables()
