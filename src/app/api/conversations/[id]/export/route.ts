import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";
import type { Citation } from "@/lib/types";

export const runtime = "nodejs";

type MessageRow = {
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
};

/** Turns a filename-unsafe title into something a download can be called. */
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "conversation"
  );
}

function toMarkdown(title: string, createdAt: string, messages: MessageRow[]): string {
  const lines = [`# ${title}`, "", `_Exported ${new Date().toISOString().slice(0, 10)}`
    + ` · started ${new Date(createdAt).toISOString().slice(0, 10)}_`, ""];

  for (const message of messages) {
    if (message.role === "user") {
      lines.push(`## Question`, "", message.content, "");
      continue;
    }

    lines.push(`### Answer`, "", message.content, "");

    if (message.citations?.length) {
      lines.push(`**Sources**`, "");
      message.citations.forEach((citation, index) => {
        const where = citation.page
          ? `${citation.filename}, page ${citation.page}`
          : citation.filename;
        // Document-level sources have no score — they came from a summary.
        const provenance =
          citation.similarity === undefined
            ? "document summary"
            : `${Math.round(citation.similarity * 100)}% similarity`;
        lines.push(`${index + 1}. ${where} — ${provenance}`);
        // The passage itself travels with the export, so the answer stays
        // checkable after it leaves the app.
        lines.push(`   > ${citation.text.replace(/\n+/g, " ").slice(0, 500)}`);
      });
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "md";

  const { rows: conversations } = await pool.query(
    "SELECT id, title, created_at FROM conversations WHERE id = $1 AND workspace_id = $2",
    [id, user.workspaceId],
  );
  if (conversations.length === 0) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  const conversation = conversations[0];

  const { rows: messages } = await pool.query(
    `SELECT role, content, citations, created_at
       FROM messages WHERE conversation_id = $1 ORDER BY created_at`,
    [id],
  );

  const filename = slugify(conversation.title);

  if (format === "json") {
    const body = JSON.stringify({ conversation, messages }, null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.json"`,
      },
    });
  }

  const body = toMarkdown(conversation.title, conversation.created_at, messages as MessageRow[]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.md"`,
    },
  });
}
