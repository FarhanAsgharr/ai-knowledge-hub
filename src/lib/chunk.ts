import type { Segment } from "./extract";

export type Chunk = { content: string; page: number | null };

const MAX_CHARS = 1400; // ~350 tokens — big enough for context, small enough to stay on-topic
const OVERLAP_CHARS = 200; // carries a sentence or two across the seam

/**
 * Splits on paragraph boundaries and packs paragraphs up to MAX_CHARS, so a
 * chunk rarely cuts mid-thought. Paragraphs longer than the limit are hard-split.
 */
export function chunkSegments(segments: Segment[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const segment of segments) {
    const paragraphs = segment.text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    let buffer = "";

    const flush = () => {
      const content = buffer.trim();
      if (content.length > 0) chunks.push({ content, page: segment.page });
      // Start the next chunk with the tail of this one for context continuity.
      buffer = content.length > OVERLAP_CHARS ? content.slice(-OVERLAP_CHARS) : "";
    };

    for (const paragraph of paragraphs) {
      if (paragraph.length > MAX_CHARS) {
        flush();
        for (let i = 0; i < paragraph.length; i += MAX_CHARS - OVERLAP_CHARS) {
          chunks.push({
            content: paragraph.slice(i, i + MAX_CHARS),
            page: segment.page,
          });
        }
        buffer = "";
        continue;
      }

      if (buffer.length + paragraph.length + 1 > MAX_CHARS) flush();
      buffer += (buffer ? " " : "") + paragraph;
    }

    const tail = buffer.trim();
    // After a flush the buffer holds only the overlap tail, which is already
    // stored in the previous chunk — don't emit it again as a duplicate.
    if (tail.length > OVERLAP_CHARS || (tail && chunks.length === 0)) {
      chunks.push({ content: tail, page: segment.page });
    }
  }

  return chunks;
}
