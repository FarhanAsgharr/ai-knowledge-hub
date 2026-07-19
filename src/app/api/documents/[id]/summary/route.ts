import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";
import { summariseDocument } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Generates a summary for a document that doesn't have one — documents ingested
 * before summaries existed, or ones where the summary step failed.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const { rows } = await pool.query(
    "SELECT filename FROM documents WHERE id = $1 AND workspace_id = $2 AND status = 'ready'",
    [id, user.workspaceId],
  );
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Document not found, or not finished indexing." },
      { status: 404 },
    );
  }

  // Chunks are already the cleaned, extracted text — no need to re-parse the file.
  const { rows: chunks } = await pool.query(
    "SELECT content FROM chunks WHERE document_id = $1 ORDER BY chunk_index",
    [id],
  );
  if (chunks.length === 0) {
    return NextResponse.json({ error: "This document has no indexed text." }, { status: 409 });
  }

  try {
    const { summary, keyPoints, keyTopics } = await summariseDocument(
      rows[0].filename,
      chunks.map((chunk) => chunk.content as string),
    );
    await pool.query(
      `UPDATE documents
          SET summary = $2, key_points = $3::jsonb, key_topics = $4::jsonb
        WHERE id = $1`,
      [id, summary, JSON.stringify(keyPoints), JSON.stringify(keyTopics)],
    );
    return NextResponse.json({ summary, keyPoints, keyTopics });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
