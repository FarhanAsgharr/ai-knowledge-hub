export type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chunk_count: number;
  summary: string | null;
  key_points: string[];
  key_topics: string[];
  created_at: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
};

export type Citation = {
  chunkId: string;
  documentId: string;
  filename: string;
  page: number | null;
  snippet: string;
  text: string;
  /**
   * Present for retrieved passages. Absent on document-level sources, which come
   * from a stored summary rather than a vector match — there is no score to show,
   * and inventing one would misrepresent how the answer was found.
   */
  similarity?: number;
};

export type Quiz = {
  mcq: Array<{
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
  }>;
  short: Array<{ question: string; answer: string }>;
  challenge: { task: string; hint: string; solution: string };
};

export type GuideSummary = {
  id: string;
  topic: string;
  created_at: string;
  has_quiz: boolean;
};

export type Guide = {
  id: string;
  topic: string;
  markdown: string;
  citations: Citation[];
  quiz: Quiz | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
};
