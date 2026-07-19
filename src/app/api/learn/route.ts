import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";
import { LEARN_MODEL, PARTS, buildGuidePrompt } from "@/lib/learn";
import { getOpenAI } from "@/lib/openai";
import { retrieve } from "@/lib/retrieve";

export const runtime = "nodejs";
// Hobby-plan functions cap at 60s; the three guide passes land around 50s.
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { topic } = await request.json();

  if (typeof topic !== "string" || topic.trim().length === 0) {
    return NextResponse.json({ error: "Topic is required." }, { status: 400 });
  }
  const subject = topic.trim().slice(0, 200);

  const sources = await retrieve(subject, user.workspaceId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));

      try {
        send({ type: "meta", citations: sources });

        const context =
          sources.length > 0
            ? `\n\nPassages from the reader's library:\n\n${sources
                .map((source, i) => {
                  const where = source.page
                    ? `${source.filename}, page ${source.page}`
                    : source.filename;
                  return `[${i + 1}] (${where})\n${source.text}`;
                })
                .join("\n\n")}`
            : "";

        const openai = getOpenAI();

        // One pass at a time. Launching all three at once and consuming them in
        // order leaves the later streams unread, and an idle stream gets
        // terminated mid-guide. Draining them concurrently into buffers avoids
        // that but needs a polling forwarder to preserve reading order — a lot
        // of machinery to save ~20s on a request that already takes ~50s.
        // Sequential streams in the right order for free.
        let markdown = "";
        for (let i = 0; i < PARTS.length; i++) {
          send({
            type: "status",
            text: `Writing part ${i + 1} of ${PARTS.length} — ${PARTS[i].label.toLowerCase()}…`,
          });

          const stream = await openai.chat.completions.create({
            model: LEARN_MODEL,
            stream: true,
            temperature: 0.4,
            // The default 4k ceiling would truncate a deep run of sections.
            max_tokens: 8000,
            messages: [
              {
                role: "system",
                content: buildGuidePrompt(
                  subject,
                  sources.length > 0,
                  PARTS[i],
                ),
              },
              { role: "user", content: `Teach me: ${subject}${context}` },
            ],
          });

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              markdown += delta;
              send({ type: "delta", text: delta });
            }
          }

          // Parts are separate completions; keep a blank line at the seam so the
          // next part's first heading still parses as a heading.
          if (!markdown.endsWith("\n\n")) {
            const gap = markdown.endsWith("\n") ? "\n" : "\n\n";
            markdown += gap;
            send({ type: "delta", text: gap });
          }
        }

        // Saved before the quiz call so a quiz failure can't lose the guide.
        const { rows } = await pool.query(
          `INSERT INTO guides (workspace_id, topic, markdown, citations)
           VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
          [user.workspaceId, subject, markdown, JSON.stringify(sources)],
        );
        const guideId = rows[0].id as string;
        // The quiz is a separate request, not part of this one. Guide plus quiz
        // in a single call runs ~65s, past the serverless function ceiling; split
        // in two, each half finishes comfortably and the guide is readable while
        // the quiz is still being written.
        send({ type: "guide", guideId });

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
