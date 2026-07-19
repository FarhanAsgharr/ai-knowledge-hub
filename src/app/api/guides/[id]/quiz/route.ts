import { NextResponse } from "next/server";

import { getCurrentUser, unauthorized } from "@/lib/auth";
import { pool } from "@/lib/db";
import { LEARN_MODEL, QUIZ_SCHEMA, buildQuizPrompt, debiasQuiz } from "@/lib/learn";
import { getOpenAI } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Writes the quiz for an existing guide.
 *
 * Kept out of the guide request so neither half approaches the serverless
 * function ceiling — and so a guide saved before this existed can still get one.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const { rows } = await pool.query(
    "SELECT topic, markdown, quiz FROM guides WHERE id = $1 AND workspace_id = $2",
    [id, user.workspaceId],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Guide not found." }, { status: 404 });
  }

  // Already written — return it rather than paying for it twice.
  if (rows[0].quiz) return NextResponse.json({ quiz: rows[0].quiz });

  try {
    const response = await getOpenAI().chat.completions.create({
      model: LEARN_MODEL,
      temperature: 0.5,
      messages: [{ role: "user", content: buildQuizPrompt(rows[0].topic, rows[0].markdown) }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "quiz", schema: QUIZ_SCHEMA, strict: true },
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return NextResponse.json({ error: "No quiz returned." }, { status: 502 });

    const quiz = debiasQuiz(JSON.parse(raw));
    await pool.query("UPDATE guides SET quiz = $2::jsonb WHERE id = $1", [
      id,
      JSON.stringify(quiz),
    ]);
    return NextResponse.json({ quiz });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
