import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims — matches vector(1536)
export const CHAT_MODEL = "gpt-4o-mini";

const BATCH_SIZE = 96;

let client: OpenAI | null = null;

/**
 * Constructed on first use, not at import time — otherwise a missing key takes
 * down every route that merely imports this module, including document listing.
 */
export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** Embeds in batches; returns vectors in the same order as `texts`. */
export async function embedAll(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    // The API may return items out of order; `index` is the source of truth.
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    out.push(...sorted.map((d) => d.embedding));
  }

  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [embedding] = await embedAll([text]);
  return embedding;
}

export const VISION_MODEL = "gpt-4o";

/**
 * Images carry no extractable text layer, so a vision model writes one. The
 * transcription is then chunked and embedded exactly like any other document,
 * which is what makes a screenshot or a photographed page searchable.
 */
export async function transcribeImage(buffer: Buffer, mimeType: string): Promise<string> {
  const response = await getOpenAI().chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.1,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Transcribe this image so it can be searched later.

- Write out every piece of visible text exactly, keeping headings and reading order.
- For a chart or diagram, state the type, the axes or labels, and the values or relationships it shows.
- For a photo with little text, describe what it shows in specific terms.
- Do not add commentary, and do not say "this image shows" — just produce the content.`,
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` },
          },
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2-3 sentences on what this document contains and who it is for.",
    },
    keyPoints: {
      type: "array",
      description:
        "5-10 bullet points covering what the document actually says. Each a complete, specific statement.",
      items: { type: "string" },
    },
    keyTopics: {
      type: "array",
      description: "3-6 short topic labels, each 1-3 words.",
      items: { type: "string" },
    },
  },
  required: ["summary", "keyPoints", "keyTopics"],
  additionalProperties: false,
} as const;

export type DocumentSummary = {
  summary: string;
  keyPoints: string[];
  keyTopics: string[];
};

/**
 * Summarises a document from its opening and a sample of later text, so a long
 * report isn't described purely by its title page.
 */
export async function summariseDocument(
  filename: string,
  chunks: string[],
): Promise<DocumentSummary> {
  const opening = chunks.slice(0, 3).join("\n\n");
  const middle = chunks.length > 6 ? chunks[Math.floor(chunks.length / 2)] : "";
  const ending = chunks.length > 3 ? chunks[chunks.length - 1] : "";
  const sample = [opening, middle, ending].filter(Boolean).join("\n\n---\n\n").slice(0, 12000);

  const response = await getOpenAI().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: `Analyse this document for a library listing.

Filename: ${filename}

${sample}

Describe what the document actually contains — specific subjects, figures and names, not "this document discusses various topics". Write plainly, no marketing language.

The key points are the main deliverable: each one should carry a real fact, finding or instruction from the document, so someone reading only the points understands its content. "Covers several topics" is a failed point; "Satellites fly at 612 km with a 96.7 minute orbital period" is a good one.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "document_summary", schema: SUMMARY_SCHEMA, strict: true },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("No summary returned.");
  return JSON.parse(raw) as DocumentSummary;
}
