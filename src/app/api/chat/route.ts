import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";
import { CHAT_MODEL, getOpenAI } from "@/lib/openai";
import {
  formatOverview,
  getLibraryOverview,
  retrieve,
  type LibraryDocument,
  type Source,
} from "@/lib/retrieve";
import type { Citation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const HISTORY_LIMIT = 10;

const SYSTEM_PROMPT = `You answer questions about the user's own document library, using only what you are given.

You get two things:
1. EXCERPTS — passages retrieved from the documents, numbered [1], [2] and so on.
2. LIBRARY — the documents in the library with a short summary and key points for each.

Rules:
- Ground every claim in the material provided. Never use outside knowledge to state a fact about these documents.
- For a detailed question, answer from the excerpts and cite the number in square brackets right after the claim it supports, e.g. "Revenue grew 12% [2]."
- For a question about what a document is, what it covers, or what's in the library, answer from LIBRARY. Name the document in the sentence — do not put a bracket number on it, because those refer to excerpts only.
- If the library holds one document, "this document" means that one. If it holds several, say which one you're describing, and briefly cover the others if the question is about the library as a whole.
- Only say you cannot find something when neither the excerpts nor the library covers it. Never refuse a question the library summaries can answer.
- Be concise and direct. Do not restate the question.`;

function buildContext(sources: Source[]): string {
  return sources
    .map((source, i) => {
      const location = source.page ? `${source.filename}, page ${source.page}` : source.filename;
      return `[${i + 1}] (${location})\n${source.text}`;
    })
    .join("\n\n");
}

/**
 * Document-level sources for an answer built from summaries. No `similarity`:
 * these weren't found by a vector match, and showing a score would imply they were.
 */
function documentCitations(library: LibraryDocument[]): Citation[] {
  return library
    .filter((doc) => doc.summary)
    .map((doc) => ({
      chunkId: `doc:${doc.id}`,
      documentId: doc.id,
      filename: doc.filename,
      page: null,
      snippet: doc.summary!.slice(0, 140),
      text: [doc.summary, ...doc.keyPoints.map((point) => `• ${point}`)].join("\n"),
    }));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { message, conversationId, documentIds } = await request.json();

  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  // Resolve the conversation before streaming so the client gets its id in the
  // opening frame even on a brand-new thread.
  let threadId: string = conversationId;
  if (threadId) {
    // Never trust a client-supplied id: confirm it belongs to this workspace,
    // otherwise a guessed uuid would append to someone else's thread.
    const { rows: owned } = await pool.query(
      "SELECT 1 FROM conversations WHERE id = $1 AND workspace_id = $2",
      [threadId, user.workspaceId],
    );
    if (owned.length === 0) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
  } else {
    const { rows } = await pool.query(
      `INSERT INTO conversations (workspace_id, title) VALUES ($1, $2) RETURNING id`,
      [user.workspaceId, message.trim().slice(0, 60)],
    );
    threadId = rows[0].id;
  }

  const { rows: history } = await pool.query(
    `SELECT role, content FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [threadId, HISTORY_LIMIT],
  );
  history.reverse();

  await pool.query(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
    [threadId, message],
  );

  // Both are needed on every turn: the passages answer detailed questions, the
  // overview answers "what is this about" — which retrieval alone cannot.
  const [sources, library] = await Promise.all([
    retrieve(message, user.workspaceId, documentIds),
    getLibraryOverview(user.workspaceId),
  ]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));

      // When retrieval found nothing, the answer comes from the stored
      // summaries instead, so the sources shown are the documents themselves.
      const citations = sources.length > 0 ? sources : documentCitations(library);

      // Sent whole, passage text included: the point of the app is that a
      // reader can check the answer against the exact text the model saw.
      send({ type: "meta", conversationId: threadId, citations });

      // Only a genuinely empty library is a dead end. With documents present,
      // the overview can still answer "what is this about" — which is exactly
      // what a top-k vector search cannot.
      if (library.length === 0) {
        const text =
          sources.length === 0
            ? "There's nothing indexed yet. Add a document and I can answer questions about it."
            : "I couldn't find anything relevant in your documents for that question. Try rephrasing it.";
        send({ type: "delta", text });
        await pool.query(
          `INSERT INTO messages (conversation_id, role, content, citations)
           VALUES ($1, 'assistant', $2, '[]'::jsonb)`,
          [threadId, text],
        );
        send({ type: "done" });
        controller.close();
        return;
      }

      let answer = "";
      try {
        const completion = await getOpenAI().chat.completions.create({
          model: CHAT_MODEL,
          stream: true,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...history.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content as string,
            })),
            {
              role: "user",
              content: [
                sources.length > 0
                  ? `EXCERPTS (retrieved passages):\n\n${buildContext(sources)}`
                  : `EXCERPTS: none matched this question closely enough to be useful.`,
                `LIBRARY (${library.length} ${library.length === 1 ? "document" : "documents"}, with summaries):\n\n${formatOverview(library)}`,
                `Question: ${message}`,
              ].join("\n\n---\n\n"),
            },
          ],
        });

        for await (const part of completion) {
          const delta = part.choices[0]?.delta?.content;
          if (delta) {
            answer += delta;
            send({ type: "delta", text: delta });
          }
        }

        await pool.query(
          `INSERT INTO messages (conversation_id, role, content, citations)
           VALUES ($1, 'assistant', $2, $3::jsonb)`,
          [threadId, answer, JSON.stringify(citations)],
        );
        send({ type: "done" });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        send({ type: "error", error: detail });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
