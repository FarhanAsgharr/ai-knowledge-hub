import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await params;

  // Scoped by workspace, so one account cannot delete another's document.
  // Chunks cascade via the foreign key.
  const { rowCount } = await pool.query(
    "DELETE FROM documents WHERE id = $1 AND workspace_id = $2",
    [id, user.workspaceId],
  );

  if (rowCount === 0) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
