-- AI Knowledge Hub — schema
-- Embeddings are text-embedding-3-small (1536 dimensions).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspaces (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename     text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   integer NOT NULL,
  status       text NOT NULL DEFAULT 'processing'
               CHECK (status IN ('processing', 'ready', 'failed')),
  error        text,
  chunk_count  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_workspace_idx
  ON documents (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content     text NOT NULL,
  page        integer,
  embedding   vector(1536) NOT NULL,
  UNIQUE (document_id, chunk_index)
);

-- HNSW beats IVFFlat here: no training step, and recall stays high on a
-- corpus that grows one upload at a time.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        text NOT NULL DEFAULT 'New conversation',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_workspace_idx
  ON conversations (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  -- [{ chunkId, documentId, filename, page, snippet }]
  citations       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON messages (conversation_id, created_at);

-- Learn mode: a generated study guide for a topic, plus its quiz.
CREATE TABLE IF NOT EXISTS guides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic        text NOT NULL,
  markdown     text NOT NULL,
  -- Same shape as messages.citations: the passages that grounded the guide.
  citations    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- { mcq: [{question, options, answerIndex, explanation}], short: [{question, answer}] }
  quiz         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guides_workspace_idx
  ON guides (workspace_id, created_at DESC);

-- Single default workspace until auth lands.
INSERT INTO workspaces (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'My Workspace')
ON CONFLICT (id) DO NOTHING;
