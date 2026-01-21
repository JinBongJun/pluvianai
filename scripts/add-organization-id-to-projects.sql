-- Add organization_id column to projects table
-- This migration adds the foreign key relationship between projects and organizations

-- Step 1: Add the column (nullable for existing projects)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS organization_id integer;

-- Step 2: Add foreign key constraint
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

-- Step 3: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_organization_id 
  ON projects(organization_id);

-- Step 4: Update alembic_version to reflect this migration
-- (Only if alembic_version table exists and doesn't have this revision)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version') THEN
    IF NOT EXISTS (
      SELECT 1 FROM alembic_version WHERE version_num = 'add_organizations_20260121'
    ) THEN
      INSERT INTO alembic_version (version_num) VALUES ('add_organizations_20260121')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;
