"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AccountBar } from "@/components/AccountBar";
import { GuideView } from "@/components/GuideView";
import { ModeNav } from "@/components/ModeNav";
import { QuizView } from "@/components/QuizView";
import { SourceStrip } from "@/components/SourceStrip";
import type { Citation, GuideSummary, Quiz } from "@/lib/types";

// Shown when the library is empty or the reader wants a nudge.
const SUGGESTIONS = ["RAG", "Embeddings", "Vector databases", "LangChain", "FastAPI"];

export default function LearnPage() {
  const [topic, setTopic] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [currentTopic, setCurrentTopic] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshGuides = useCallback(async () => {
    const response = await fetch("/api/guides");
    const data = await response.json();
    setGuides(data.guides ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/guides");
      const data = await response.json();
      if (!cancelled) setGuides(data.guides ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow the stream while it writes, but stop fighting the reader once they
  // scroll up to re-read something.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !busy) return;
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 200;
    if (nearBottom) element.scrollTop = element.scrollHeight;
  }, [markdown, busy]);

  async function generate(subject: string) {
    const clean = subject.trim();
    if (!clean || busy) return;

    setBusy(true);
    setError(null);
    setMarkdown("");
    setQuiz(null);
    setCitations([]);
    setCurrentTopic(clean);
    setStatus("Searching your library…");

    try {
      const response = await fetch("/api/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: clean }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? "The server didn't return a guide.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let guideId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const frame = JSON.parse(line);

          if (frame.type === "meta") {
            setCitations(frame.citations as Citation[]);
            setStatus("Writing your guide…");
          } else if (frame.type === "delta") {
            setStatus(null);
            setMarkdown((prev) => prev + frame.text);
          } else if (frame.type === "status") {
            setStatus(frame.text);
          } else if (frame.type === "guide") {
            guideId = frame.guideId as string;
            void refreshGuides();
          } else if (frame.type === "error") {
            setError(frame.error);
          }
        }
      }
      // The guide is complete and readable at this point; the quiz is a second
      // request so neither call runs long enough to be cut off.
      if (guideId) {
        setStatus("Writing your quiz…");
        try {
          const quizResponse = await fetch(`/api/guides/${guideId}/quiz`, { method: "POST" });
          const data = await quizResponse.json();
          if (quizResponse.ok) {
            setQuiz(data.quiz as Quiz);
            void refreshGuides();
          } else {
            // A missing quiz doesn't invalidate the guide, so this is a notice,
            // not an error banner over the whole page.
            setError(`The guide is saved, but the quiz failed: ${data.error}`);
          }
        } catch {
          setError("The guide is saved, but the quiz request didn't complete.");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function open(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/guides/${id}`);
      const { guide } = await response.json();
      setMarkdown(guide.markdown);
      setCitations(guide.citations ?? []);
      setQuiz(guide.quiz ?? null);
      setCurrentTopic(guide.topic);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete the guide on ${name}?`)) return;
    await fetch(`/api/guides/${id}`, { method: "DELETE" });
    void refreshGuides();
  }

  return (
    <main className="flex h-full flex-col lg:flex-row">
      <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-b border-rule bg-panel/60 lg:h-full lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
        <header className="border-b border-rule px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-lg tracking-tight text-parchment">Learn</h1>
              <p className="eyebrow mt-1">
                {guides.length} saved {guides.length === 1 ? "guide" : "guides"}
              </p>
            </div>
            <ModeNav />
          </div>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void generate(topic);
          }}
          className="border-b border-rule px-5 py-4"
        >
          <label htmlFor="topic" className="eyebrow">
            Topic
          </label>
          <input
            id="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Embeddings"
            disabled={busy}
            className="mt-2 w-full border border-rule bg-ink px-3 py-2 text-sm text-parchment placeholder:text-muted/70 focus:border-cyan focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || topic.trim().length === 0}
            className="mt-2 w-full border border-cyan py-2 font-mono text-xs uppercase tracking-widest text-cyan transition-colors hover:bg-cyan hover:text-ink disabled:cursor-not-allowed disabled:border-rule disabled:text-muted disabled:hover:bg-transparent"
          >
            {busy ? "Working…" : "Build guide"}
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {guides.length === 0 ? (
            <p className="px-2 text-sm leading-relaxed text-muted">
              No guides yet. Enter a topic and you&apos;ll get a full study guide with a
              quiz at the end.
            </p>
          ) : (
            <ul className="flex flex-col">
              {guides.map((guide) => (
                <li
                  key={guide.id}
                  className="group flex items-start gap-2 border-b border-rule/50 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => void open(guide.id)}
                    className="min-w-0 flex-1 px-2 py-3 text-left"
                  >
                    <span className="block truncate text-sm text-parchment/90">
                      {guide.topic}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted">
                      {new Date(guide.created_at).toLocaleDateString()}
                      {guide.has_quiz && <span className="text-cyan"> · quiz</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(guide.id, guide.topic)}
                    aria-label={`Delete guide on ${guide.topic}`}
                    className="mt-3 px-1 font-mono text-xs text-muted opacity-0 transition-opacity hover:text-rust focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <AccountBar />
      </aside>

      <section className="ground flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 py-10">
            {error && (
              <p role="alert" className="mb-6 border-l-2 border-rust bg-rust/10 px-4 py-3 text-sm">
                {error}
              </p>
            )}

            {!markdown && !status && !error ? (
              <div className="rise pt-8">
                <p className="eyebrow">Study guides from your library</p>
                <h2 className="mt-3 max-w-xl font-display text-3xl leading-tight tracking-tight text-parchment sm:text-4xl">
                  Name a topic. Get the whole thing — worked examples, code, and a quiz
                  to prove you know it.
                </h2>
                <p className="mt-4 max-w-lg font-reading text-lg leading-relaxed text-muted">
                  Where your documents cover the topic, the guide teaches from them and
                  cites the passage. Everything else comes from general knowledge, so a
                  guide works even on an empty library.
                </p>

                <div className="mt-7 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setTopic(suggestion);
                        void generate(suggestion);
                      }}
                      className="border border-rule px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-cyan hover:text-cyan"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {currentTopic && (
                  <header className="mb-8">
                    <p className="eyebrow">Study guide</p>
                    <h2 className="mt-2 font-display text-3xl tracking-tight text-parchment">
                      {currentTopic}
                    </h2>
                  </header>
                )}

                {markdown && <GuideView markdown={markdown} />}

                {status && (
                  <p className="eyebrow mt-6 animate-pulse" aria-live="polite">
                    {status}
                  </p>
                )}

                {citations.length > 0 && <SourceStrip citations={citations} />}
                {quiz && <QuizView quiz={quiz} />}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
