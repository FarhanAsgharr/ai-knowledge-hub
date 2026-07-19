-- Adds accounts, sessions, per-user workspace ownership and document summaries.
-- Idempotent: safe to run against a database created by schema.sql.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Emails are matched case-insensitively; store them lowercased on write.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  -- SHA-256 of the cookie value, never the token itself: a leaked database
  -- dump then can't be replayed as a live session.
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

-- Each account owns its workspaces. Nullable so the pre-auth default workspace
-- survives the migration; the first account to sign up adopts it.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON workspaces (owner_id);

-- Document summaries, generated after ingestion.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS key_topics jsonb NOT NULL DEFAULT '[]'::jsonb;
