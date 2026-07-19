import { NextResponse } from "next/server";

import { forbidden, getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const [totals, perUser, recent, failures] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT count(*)::int FROM users)                        AS users,
        (SELECT count(*)::int FROM workspaces)                   AS workspaces,
        (SELECT count(*)::int FROM documents)                    AS documents,
        (SELECT count(*)::int FROM chunks)                       AS chunks,
        (SELECT count(*)::int FROM conversations)                AS conversations,
        (SELECT count(*)::int FROM messages)                     AS messages,
        (SELECT count(*)::int FROM guides)                       AS guides,
        (SELECT coalesce(sum(size_bytes), 0)::bigint FROM documents) AS bytes_stored,
        (SELECT count(*)::int FROM sessions WHERE expires_at > now()) AS active_sessions
    `),
    // Scalar subqueries rather than three LEFT JOINs: joining documents,
    // guides and conversations at once multiplies rows, and the sum(DISTINCT)
    // needed to undo that would silently undercount two files of equal size.
    pool.query(`
      SELECT u.id, u.email, u.name, u.role, u.created_at,
             (SELECT count(*)::int FROM documents d
                JOIN workspaces w ON w.id = d.workspace_id
               WHERE w.owner_id = u.id) AS documents,
             (SELECT count(*)::int FROM guides g
                JOIN workspaces w ON w.id = g.workspace_id
               WHERE w.owner_id = u.id) AS guides,
             (SELECT count(*)::int FROM conversations c
                JOIN workspaces w ON w.id = c.workspace_id
               WHERE w.owner_id = u.id) AS conversations,
             (SELECT coalesce(sum(d.size_bytes), 0)::bigint FROM documents d
                JOIN workspaces w ON w.id = d.workspace_id
               WHERE w.owner_id = u.id) AS bytes_stored
        FROM users u
       ORDER BY u.created_at
    `),
    pool.query(`
      SELECT 'document' AS kind, filename AS label, created_at FROM documents
      UNION ALL
      SELECT 'guide', topic, created_at FROM guides
      UNION ALL
      SELECT 'conversation', title, created_at FROM conversations
      ORDER BY created_at DESC
      LIMIT 12
    `),
    // Ingestion failures are the thing an operator most needs to see.
    pool.query(`
      SELECT filename, error, created_at FROM documents
       WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10
    `),
  ]);

  return NextResponse.json({
    totals: totals.rows[0],
    users: perUser.rows,
    recent: recent.rows,
    failures: failures.rows,
  });
}
