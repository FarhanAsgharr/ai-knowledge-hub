import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isSupported } from "@/lib/file-types";
import { ingestDocument } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel caps a serverless request body at 4.5MB, so a larger limit would only
// fail at the platform with an opaque 413 the app never sees. Local runs keep
// the roomier limit.
const MAX_BYTES = process.env.VERCEL ? 4 * 1024 * 1024 : 20 * 1024 * 1024;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { rows } = await pool.query(
    `SELECT id, filename, mime_type, size_bytes, status, error, chunk_count,
            summary, key_points, key_topics, created_at
       FROM documents
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [user.workspaceId],
  );
  return NextResponse.json({ documents: rows });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_BYTES / 1024 / 1024}MB limit.` },
      { status: 413 },
    );
  }
  if (!isSupported(file.type, file.name)) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload a PDF, Word, PowerPoint, Excel, image, CSV or text file.",
      },
      { status: 415 },
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO documents (workspace_id, filename, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [user.workspaceId, file.name, file.type || "application/octet-stream", file.size],
  );
  const documentId = rows[0].id as string;

  const buffer = Buffer.from(await file.arrayBuffer());
  // Awaited rather than backgrounded: serverless runtimes freeze the instance
  // once the response is sent, which would strand the job mid-embedding.
  await ingestDocument(documentId, buffer, file.type, file.name);

  const { rows: final } = await pool.query(
    `SELECT id, filename, mime_type, size_bytes, status, error, chunk_count,
            summary, key_points, key_topics, created_at
       FROM documents WHERE id = $1`,
    [documentId],
  );

  return NextResponse.json({ document: final[0] }, { status: 201 });
}
