import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  // The markdown body is omitted here — the list only needs headers.
  const { rows } = await pool.query(
    `SELECT id, topic, created_at, quiz IS NOT NULL AS has_quiz
       FROM guides
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [user.workspaceId],
  );
  return NextResponse.json({ guides: rows });
}
