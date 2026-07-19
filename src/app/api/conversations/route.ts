import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { rows } = await pool.query(
    `SELECT c.id, c.title, c.created_at, count(m.id)::int AS message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.workspace_id = $1
      GROUP BY c.id
      HAVING count(m.id) > 0
      ORDER BY c.created_at DESC
      LIMIT 50`,
    [user.workspaceId],
  );
  return NextResponse.json({ conversations: rows });
}
