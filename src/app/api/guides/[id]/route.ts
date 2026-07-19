import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { rows } = await pool.query(
    `SELECT id, topic, markdown, citations, quiz, created_at
       FROM guides WHERE id = $1 AND workspace_id = $2`,
    [id, user.workspaceId],
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Guide not found." }, { status: 404 });
  }
  return NextResponse.json({ guide: rows[0] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { rowCount } = await pool.query(
    "DELETE FROM guides WHERE id = $1 AND workspace_id = $2",
    [id, user.workspaceId],
  );
  if (rowCount === 0) {
    return NextResponse.json({ error: "Guide not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
