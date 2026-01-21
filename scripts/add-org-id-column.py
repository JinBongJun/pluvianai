"""
Quick script to add organization_id column to projects table
Run this directly with Python (no virtualenv needed if psycopg2-binary is installed)
"""
import os
import sys

# Get DATABASE_URL from environment
db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("ERROR: DATABASE_URL environment variable not set!")
    print("Set it with: $env:DATABASE_URL='postgresql://...'")
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 not installed. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "--quiet"])
    import psycopg2

print("Connecting to database...")
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

print("Adding organization_id column to projects table...")

# Step 1: Add column
try:
    cur.execute("""
        ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS organization_id integer;
    """)
    print("[OK] Added organization_id column")
except Exception as e:
    print(f"[WARN] Column might already exist: {e}")

# Step 2: Add foreign key constraint
try:
    cur.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'projects_organization_id_fkey'
            ) THEN
                ALTER TABLE projects
                    ADD CONSTRAINT projects_organization_id_fkey
                        FOREIGN KEY (organization_id) REFERENCES organizations(id);
            END IF;
        END $$;
    """)
    print("[OK] Added foreign key constraint")
except Exception as e:
    print(f"[WARN] Constraint might already exist: {e}")

# Step 3: Add index
try:
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_projects_organization_id 
        ON projects(organization_id);
    """)
    print("[OK] Added index")
except Exception as e:
    print(f"[WARN] Index might already exist: {e}")

# Verify
cur.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'organization_id';
""")
result = cur.fetchone()

if result:
    print(f"\n[OK] Verification: organization_id column exists")
    print(f"   Type: {result[1]}, Nullable: {result[2]}")
else:
    print("\n[ERROR] Verification failed: column not found")

cur.close()
conn.close()

print("\n[OK] Done! Check Railway UI to confirm the column was added.")
