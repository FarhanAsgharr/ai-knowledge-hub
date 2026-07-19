import { Pool } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

// Next dev reloads modules on every edit; without the global the pool leaks
// a new set of connections each time.
export const pool =
  global.__pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://localhost:5432/ai_knowledge_hub",
    max: 10,
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

export const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

/** pgvector's text input format. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
