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

  const { rows: conversations } = await pool.query(
    "SELECT id, title, created_at FROM conversations WHERE id = $1 AND workspace_id = $2",
    [id, user.workspaceId],
  );
  if (conversations.length === 0) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { rows: messages } = await pool.query(
    `SELECT id, role, content, citations, created_at
       FROM messages WHERE conversation_id = $1 ORDER BY created_at`,
    [id],
  );

  return NextResponse.json({ conversation: conversations[0], messages });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { rowCount } = await pool.query(
    "DELETE FROM conversations WHERE id = $1 AND workspace_id = $2",
    [id, user.workspaceId],
  );
  if (rowCount === 0) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
