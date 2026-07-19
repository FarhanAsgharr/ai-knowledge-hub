import { pool, toVectorLiteral } from "./db";
import { embedOne } from "./openai";

export type Source = {
  chunkId: string;
  documentId: string;
  filename: string;
  page: number | null;
  /** One-line preview for the collapsed row. */
  snippet: string;
  /** The passage exactly as it was given to the model, for verification. */
  text: string;
  similarity: number;
};

const TOP_K = 8;
// Cosine distance above this means the chunk shares almost no topical overlap
// with the question; including it invites the model to answer from noise.
const MAX_DISTANCE = 0.75;

export type LibraryDocument = {
  id: string;
  filename: string;
  summary: string | null;
  keyPoints: string[];
  keyTopics: string[];
  chunkCount: number;
};

const OVERVIEW_LIMIT = 25;

/**
 * What's in the library, at document level.
 *
 * Vector search answers local questions ("what happened to X") but not global
 * ones ("what is this document about", "summarise it"). A global question has no
 * topical content to match, so it either retrieves arbitrary fragments or clears
 * no chunk at all. The summaries written at ingest time are the right source for
 * those, so the chat gets them alongside the retrieved passages.
 */
export async function getLibraryOverview(workspaceId: string): Promise<LibraryDocument[]> {
  const { rows } = await pool.query(
    `SELECT id, filename, summary, key_points, key_topics, chunk_count
       FROM documents
      WHERE workspace_id = $1 AND status = 'ready'
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, OVERVIEW_LIMIT],
  );

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    summary: row.summary,
    keyPoints: row.key_points ?? [],
    keyTopics: row.key_topics ?? [],
    chunkCount: row.chunk_count,
  }));
}

/** Renders the overview for a prompt, bounded so a big library can't crowd out the passages. */
export function formatOverview(documents: LibraryDocument[]): string {
  return documents
    .map((doc) => {
      const parts = [`- ${doc.filename}`];
      if (doc.summary) parts.push(`  ${doc.summary}`);
      if (doc.keyPoints.length > 0) {
        parts.push(doc.keyPoints.slice(0, 8).map((point) => `  • ${point}`).join("\n"));
      }
      return parts.join("\n");
    })
    .join("\n\n")
    .slice(0, 9000);
}

export async function retrieve(
  query: string,
  workspaceId: string,
  documentIds?: string[],
): Promise<Source[]> {
  const embedding = toVectorLiteral(await embedOne(query));
  const filterByDocument = documentIds && documentIds.length > 0;

  const { rows } = await pool.query(
    `SELECT c.id            AS chunk_id,
            c.content,
            c.page,
            d.id            AS document_id,
            d.filename,
            c.embedding <=> $1 AS distance
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
      WHERE d.workspace_id = $2
        AND d.status = 'ready'
        ${filterByDocument ? "AND d.id = ANY($4::uuid[])" : ""}
        AND c.embedding <=> $1 < ${MAX_DISTANCE}
      ORDER BY c.embedding <=> $1
      LIMIT $3`,
    filterByDocument
      ? [embedding, workspaceId, TOP_K, documentIds]
      : [embedding, workspaceId, TOP_K],
  );

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    filename: row.filename,
    page: row.page,
    text: row.content,
    snippet: row.content.slice(0, 140),
    similarity: 1 - Number(row.distance),
  }));
}
