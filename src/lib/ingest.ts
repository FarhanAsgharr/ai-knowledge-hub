import { chunkSegments } from "./chunk";
import { pool, toVectorLiteral } from "./db";
import { extractSegments } from "./extract";
import { embedAll, summariseDocument } from "./openai";

/**
 * Parses, chunks, embeds and stores a document. Runs after the upload response
 * is sent, so it updates `status` on the row rather than throwing to a caller.
 */
export async function ingestDocument(
  documentId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<void> {
  try {
    const segments = await extractSegments(buffer, mimeType, filename);
    const chunks = chunkSegments(segments);

    if (chunks.length === 0) {
      throw new Error(
        "No readable text found. If this is a scanned document, export the pages as images and upload those instead.",
      );
    }

    const embeddings = await embedAll(chunks.map((c) => c.content));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Re-ingesting the same document replaces its chunks rather than
      // colliding on the (document_id, chunk_index) unique constraint.
      await client.query("DELETE FROM chunks WHERE document_id = $1", [documentId]);

      for (let i = 0; i < chunks.length; i++) {
        await client.query(
          `INSERT INTO chunks (document_id, chunk_index, content, page, embedding)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            documentId,
            i,
            chunks[i].content,
            chunks[i].page,
            toVectorLiteral(embeddings[i]),
          ],
        );
      }

      await client.query(
        `UPDATE documents SET status = 'ready', chunk_count = $2, error = NULL
         WHERE id = $1`,
        [documentId, chunks.length],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // After the commit, and deliberately not fatal: a document that is chunked
    // and searchable is still useful without a summary, so a failure here must
    // not mark the whole ingestion failed.
    try {
      const { summary, keyPoints, keyTopics } = await summariseDocument(
        filename,
        chunks.map((chunk) => chunk.content),
      );
      await pool.query(
        `UPDATE documents
            SET summary = $2, key_points = $3::jsonb, key_topics = $4::jsonb
          WHERE id = $1`,
        [documentId, summary, JSON.stringify(keyPoints), JSON.stringify(keyTopics)],
      );
    } catch (error) {
      console.error(`[ingest] summary failed for ${filename}:`, error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      "UPDATE documents SET status = 'failed', error = $2 WHERE id = $1",
      [documentId, message],
    );
  }
}
