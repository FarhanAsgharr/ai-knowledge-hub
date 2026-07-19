"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatMessage,
  Citation,
  ConversationSummary,
  DocumentRow,
} from "@/lib/types";

import { SourceStrip } from "./SourceStrip";

/** Renders [1]-style citation markers as instrument type, inline with the prose. */
function AnswerText({ content }: { content: string }) {
  const parts = content.split(/(\[\d+\])/g);
  return (
    <p className="answer whitespace-pre-wrap">
      {parts.map((part, index) =>
        /^\[\d+\]$/.test(part) ? (
          <span key={index} className="marker">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export function Chat({ documents }: { documents: DocumentRow[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const readyCount = documents.filter((doc) => doc.status === "ready").length;

  const refreshConversations = useCallback(async () => {
    const response = await fetch("/api/conversations");
    if (!response.ok) return;
    const data = await response.json();
    setConversations(data.conversations ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled) setConversations(data.conversations ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) return;
    const data = await response.json();
    setMessages(
      data.messages.map((m: ChatMessage) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations ?? [],
      })),
    );
    setConversationId(id);
    setHistoryOpen(false);
  }

  function startNew() {
    setMessages([]);
    setConversationId(null);
    setHistoryOpen(false);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Shaped loosely so both the form submit and the Enter keydown can call it.
  async function send(event: { preventDefault: () => void }) {
    event.preventDefault();
    const question = input.trim();
    if (!question || streaming) return;

    setInput("");
    setStreaming(true);

    const answerId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: question, citations: [] },
      { id: answerId, role: "assistant", content: "", citations: [] },
    ]);

    const patch = (update: (message: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === answerId ? update(m) : m)));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, conversationId }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? "The server didn't return an answer.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // NDJSON: one JSON frame per line, so a partial line is held back.
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
            setConversationId(frame.conversationId);
            // A first message creates the thread, so the history list is stale.
            void refreshConversations();
            patch((m) => ({ ...m, citations: frame.citations as Citation[] }));
          } else if (frame.type === "delta") {
            patch((m) => ({ ...m, content: m.content + frame.text }));
          } else if (frame.type === "error") {
            patch((m) => ({ ...m, content: `Something broke mid-answer: ${frame.error}` }));
          }
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      patch((m) => ({ ...m, content: detail }));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section className="ground flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-rule bg-panel/50 px-6 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-expanded={historyOpen}
            className="border border-rule px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:border-cyan hover:text-cyan"
          >
            History ({conversations.length})
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={startNew}
              className="border border-rule px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:border-cyan hover:text-cyan"
            >
              New
            </button>
          )}
        </div>

        {/* Export needs a saved thread, so it only appears once one exists. */}
        {conversationId && (
          <div className="flex items-center gap-1">
            <span className="eyebrow hidden sm:inline">Export</span>
            <a
              href={`/api/conversations/${conversationId}/export?format=md`}
              className="border border-rule px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:border-amber hover:text-amber"
            >
              .md
            </a>
            <a
              href={`/api/conversations/${conversationId}/export?format=json`}
              className="border border-rule px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:border-amber hover:text-amber"
            >
              .json
            </a>
          </div>
        )}

        {historyOpen && (
          <div className="rise absolute left-6 top-full z-10 mt-1 max-h-80 w-80 overflow-y-auto border border-rule bg-panel shadow-xl">
            {conversations.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">
                No saved conversations yet. Ask something and it&apos;s kept here.
              </p>
            ) : (
              <ul>
                {conversations.map((conversation) => (
                  <li key={conversation.id} className="border-b border-rule/50 last:border-0">
                    <button
                      type="button"
                      onClick={() => void openConversation(conversation.id)}
                      className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-raised ${
                        conversation.id === conversationId ? "bg-raised" : ""
                      }`}
                    >
                      <span className="block truncate text-sm text-parchment/90">
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted">
                        {conversation.message_count} messages ·{" "}
                        {new Date(conversation.created_at).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-10">
          {messages.length === 0 ? (
            <div className="rise pt-8">
              <p className="eyebrow">Retrieval-grounded answers</p>
              <h2 className="mt-3 max-w-xl font-display text-3xl leading-tight tracking-tight text-parchment sm:text-4xl">
                Ask your documents anything, and see exactly where the answer came from.
              </h2>
              <p className="mt-4 max-w-lg font-reading text-lg leading-relaxed text-muted">
                {readyCount === 0
                  ? "Add a document in the library to get started. Every answer here is built from passages retrieved out of your own files — never from the model's memory."
                  : `${readyCount} ${readyCount === 1 ? "document is" : "documents are"} indexed and ready. Every answer cites the passages it was built from, with the similarity score that surfaced them.`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="rise flex justify-end">
                    <p className="max-w-[85%] border-l-2 border-amber bg-raised px-4 py-2.5 text-[15px] leading-relaxed text-parchment">
                      {message.content}
                    </p>
                  </div>
                ) : (
                  <article key={message.id} className="rise">
                    {message.content ? (
                      <AnswerText content={message.content} />
                    ) : (
                      <p className="eyebrow animate-pulse">Retrieving passages…</p>
                    )}
                    <SourceStrip citations={message.citations} />
                  </article>
                ),
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={send} className="border-t border-rule bg-panel/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) void send(event);
            }}
            rows={1}
            placeholder={
              readyCount === 0 ? "Add a document first…" : "Ask about your documents…"
            }
            disabled={readyCount === 0}
            className="max-h-40 min-h-[44px] flex-1 resize-none border border-rule bg-ink px-3 py-2.5 text-[15px] text-parchment placeholder:text-muted/70 focus:border-cyan focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || input.trim().length === 0}
            className="h-[44px] shrink-0 border border-cyan px-5 font-mono text-xs uppercase tracking-widest text-cyan transition-colors hover:bg-cyan hover:text-ink disabled:cursor-not-allowed disabled:border-rule disabled:text-muted disabled:hover:bg-transparent"
          >
            {streaming ? "…" : "Ask"}
          </button>
        </div>
      </form>
    </section>
  );
}
