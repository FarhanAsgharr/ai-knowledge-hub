-- Point-form analysis for each document, alongside the prose summary.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS key_points jsonb NOT NULL DEFAULT '[]'::jsonb;
