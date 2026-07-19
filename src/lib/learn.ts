/**
 * Learn mode: turns a topic into a full study guide.
 *
 * Unlike Ask mode, this is not strictly grounded — a study guide needs analogies,
 * interview questions and code that won't appear in the user's files. Retrieved
 * passages are used where the library covers the topic and cited as such; the rest
 * is the model's own knowledge, and the prompt requires that distinction be visible.
 */

export const LEARN_MODEL = "gpt-4o";

/** The 35-point template, ordered so a reader can go top to bottom the night before. */
const SECTIONS = [
  "Definition in simple language",
  "Why it is used",
  "How it works, step by step",
  "Real-world examples",
  "An easy analogy",
  "Complete workflow / architecture (with an ASCII diagram)",
  "Important terminology (table: term | meaning)",
  "Advantages",
  "Disadvantages",
  "Internal working — what actually happens under the hood, not just syntax",
  "Important formulas, with each symbol explained",
  "Comparisons of the main approaches or variants (table)",
  "Python implementation, commented line by line",
  "LangChain implementation",
  "Frequently used functions, classes and methods (table)",
  "Important parameters and what each one does (table)",
  "Common mistakes beginners make",
  "Common errors and how to fix them",
  "Best practices and professional tips",
  "Flowchart of the complete process (ASCII)",
  "Real-world projects where this is used",
  "Beginner project",
  "Intermediate project",
  "Advanced project",
  "Where this fits in the AI/LLM ecosystem",
  "How it connects to other concepts",
  "Common interview questions with answers",
  "Memory tricks and shortcuts",
  "Most important quiz points",
  "What to learn next",
  "Summary",
  "Revision sheet — last-minute review, only the highest-value facts",
];

/**
 * The guide is written in three passes rather than one.
 *
 * Asked for all 32 sections at once, the model rations its effort and every
 * section comes out two sentences long — the token ceiling is never the binding
 * constraint, terseness is. Three focused calls each get room to go deep, and
 * they run concurrently so the reader doesn't wait three times as long.
 */
export const PARTS: Array<{ label: string; from: number; to: number }> = [
  { label: "Foundations", from: 0, to: 11 },
  { label: "Practice and code", from: 11, to: 20 },
  { label: "Application and review", from: 20, to: SECTIONS.length },
];

export function buildGuidePrompt(
  topic: string,
  hasContext: boolean,
  part?: { label: string; from: number; to: number },
): string {
  const range = part ?? { label: "", from: 0, to: SECTIONS.length };
  const assigned = SECTIONS.slice(range.from, range.to)
    .map((section, i) => `${range.from + i + 1}. ${section}`)
    .join("\n");

  const scope = part
    ? `This is one part of a longer guide. Write ONLY sections ${range.from + 1}–${range.to}. Do not write an introduction, do not summarise the other parts, and do not repeat earlier sections — your output is concatenated directly after them.

Write these sections, as \`##\` headings, numbered exactly as shown:

${assigned}`
    : `Write the guide in Markdown with these sections, as \`##\` headings, in this order:

${assigned}`;

  return `You are teaching a motivated beginner who has a quiz and interviews coming up. Take them from zero to professional depth on: **${topic}**

${scope}

Rules:
- Skip any section that genuinely does not apply to this topic and say nothing about it. Never pad a section with filler to fill the slot — padding makes the revision sheet worse, which defeats the point.
- Go deep. This replaces a textbook chapter, not a cheat sheet. A section of two thin sentences has failed: explain the mechanism, give a concrete example with real numbers, and say what happens when it goes wrong. The reader is a beginner now but needs to hold their own in an interview by the end.
- Simple English. Short sentences. Explain jargon the first time it appears.
- Use GitHub-flavoured Markdown tables for every comparison, parameter list and terminology list.
- Put ASCII diagrams and flowcharts inside \`\`\`text fences so they keep their alignment.
- Never write LaTeX. There is no math renderer, so \\frac and \\text render as literal backslashes. Write formulas in plain Unicode inside a \`\`\`text fence, e.g. "cos(θ) = (A · B) / (||A|| × ||B||)", then define every symbol underneath.
- For every code block: explain what each import, class, function and parameter does, and *why* the line is there — not just what it does. Comment the code itself line by line.
- Prefer concrete numbers and real library names over vague description.
- The revision sheet at the end must be dense and short: only what is most likely to be tested.
${
  hasContext
    ? `- Passages from the reader's own document library are provided below. Where they cover the topic, teach from them and cite the passage number in square brackets, e.g. [2]. Where you go beyond them, just teach normally without a citation. Never attach a citation to a claim the passages do not support.`
    : `- The reader's library has nothing on this topic, so teach entirely from your own knowledge. Do not invent citations.`
}

Do not open with a preamble about what you are about to do. Start at the first section you were assigned.`;
}

export const QUIZ_SCHEMA = {
  type: "object",
  properties: {
    mcq: {
      type: "array",
      description: "Exactly 10 multiple-choice questions.",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            description: "Exactly 4 options, no letter prefixes.",
            items: { type: "string" },
          },
          answerIndex: {
            type: "integer",
            description: "0-based index of the correct option.",
          },
          explanation: {
            type: "string",
            description: "Why the correct option is right and the tempting wrong one is not.",
          },
        },
        required: ["question", "options", "answerIndex", "explanation"],
        additionalProperties: false,
      },
    },
    short: {
      type: "array",
      description: "Exactly 5 short-answer questions.",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
        },
        required: ["question", "answer"],
        additionalProperties: false,
      },
    },
    challenge: {
      type: "object",
      description: "A small coding challenge on this topic.",
      properties: {
        task: { type: "string" },
        hint: { type: "string" },
        solution: { type: "string", description: "Commented reference solution." },
      },
      required: ["task", "hint", "solution"],
      additionalProperties: false,
    },
  },
  required: ["mcq", "short", "challenge"],
  additionalProperties: false,
} as const;

type QuizShape = {
  mcq: Array<{ question: string; options: string[]; answerIndex: number; explanation: string }>;
};

/**
 * Models cluster the correct answer in the first few positions — a generated set
 * often never marks the last option correct, which teaches "never pick D" instead
 * of the subject. Shuffling server-side makes position carry no information.
 */
export function debiasQuiz<T extends QuizShape>(quiz: T): T {
  const mcq = quiz.mcq.map((question) => {
    const indices = question.options.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return {
      ...question,
      options: indices.map((i) => question.options[i]),
      answerIndex: indices.indexOf(question.answerIndex),
    };
  });

  return { ...quiz, mcq };
}

export function buildQuizPrompt(topic: string, guide: string): string {
  return `Here is a study guide on "${topic}":

${guide.slice(0, 24000)}

Write a quiz that tests understanding of this material.

- 10 multiple-choice questions, 4 options each, exactly one correct.
- Make the wrong options plausible — a reader who half-understands should be tempted. No joke options.
- Spread the correct answer across all four positions; do not favour any one index.
- 5 short-answer questions that need a sentence or two, not a single word.
- One small coding challenge with a hint and a commented solution.
- Test understanding and application, not trivia about exact wording in the guide.`;
}
