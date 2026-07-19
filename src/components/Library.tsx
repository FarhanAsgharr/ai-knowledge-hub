"use client";

import { useRef, useState } from "react";

import { ACCEPT_ATTRIBUTE } from "@/lib/file-types";
import type { DocumentRow } from "@/lib/types";

import { AccountBar } from "./AccountBar";
import { ModeNav } from "./ModeNav";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const STATUS_STYLES: Record<DocumentRow["status"], string> = {
  ready: "text-cyan",
  processing: "text-amber",
  failed: "text-rust",
};

export function Library({
  documents,
  loading,
  onUploaded,
  onDeleted,
}: {
  documents: DocumentRow[];
  loading: boolean;
  onUploaded: () => void;
  onDeleted: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summarising, setSummarising] = useState<string | null>(null);

  const totalChunks = documents.reduce((sum, doc) => sum + doc.chunk_count, 0);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/documents", { method: "POST", body });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Upload failed.");
        } else if (data.document.status === "failed") {
          setError(`${file.name}: ${data.document.error}`);
        }
        onUploaded();
      } catch {
        setError(`${file.name} didn't reach the server. Check that it's still running.`);
      }
    }

    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function summarise(id: string) {
    setSummarising(id);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${id}/summary`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Couldn't summarise that document.");
        return;
      }
      onUploaded();
      setExpanded(id);
    } finally {
      setSummarising(null);
    }
  }

  async function remove(id: string, filename: string) {
    if (!confirm(`Remove ${filename} and everything indexed from it?`)) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    // On narrow screens the library is capped so the composer stays reachable;
    // on desktop it becomes a full-height rail.
    <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-b border-rule bg-panel/60 lg:max-h-none lg:h-full lg:w-80 lg:border-b-0 lg:border-r">
      <header className="border-b border-rule px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-lg tracking-tight text-parchment">Knowledge Hub</h1>
            <p className="eyebrow mt-1">
              {documents.length} {documents.length === 1 ? "document" : "documents"} ·{" "}
              {totalChunks} indexed {totalChunks === 1 ? "chunk" : "chunks"}
            </p>
          </div>
          <ModeNav />
        </div>
      </header>

      <div className="px-5 py-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void upload(event.dataTransfer.files);
          }}
          className={`border border-dashed px-4 py-6 text-center transition-colors ${
            dragging ? "border-cyan bg-cyan/5" : "border-rule"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(event) => void upload(event.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading !== null}
            className="font-display text-sm text-parchment underline decoration-amber decoration-2 underline-offset-4 hover:text-amber disabled:cursor-wait disabled:opacity-60"
          >
            {uploading ? `Indexing ${uploading}…` : "Add a document"}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            or drop a file here — PDF, Word, PowerPoint, Excel, images, CSV, text
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-3 border-l-2 border-rust bg-rust/10 px-3 py-2 text-sm text-parchment/85">
            {error}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {loading ? (
          <p className="px-2 text-sm text-muted">Loading library…</p>
        ) : documents.length === 0 ? (
          <p className="px-2 text-sm leading-relaxed text-muted">
            Nothing indexed yet. Add a document and it becomes searchable — chunked,
            embedded, and citable.
          </p>
        ) : (
          <ul className="flex flex-col">
            {documents.map((doc) => {
              const isOpen = expanded === doc.id;
              return (
                <li
                  key={doc.id}
                  className="group border-b border-rule/50 px-2 py-3 last:border-0"
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : doc.id)}
                      disabled={!doc.summary}
                      aria-expanded={doc.summary ? isOpen : undefined}
                      className="min-w-0 flex-1 text-left disabled:cursor-default"
                    >
                      <span className="block truncate text-sm text-parchment/90" title={doc.filename}>
                        {doc.filename}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted">
                        <span className={STATUS_STYLES[doc.status]}>{doc.status}</span>
                        {doc.status === "ready" && ` · ${doc.chunk_count} chunks`}
                        {` · ${formatSize(doc.size_bytes)}`}
                        {doc.summary && <span className="text-cyan"> · summary</span>}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void remove(doc.id, doc.filename)}
                      aria-label={`Remove ${doc.filename}`}
                      className="mt-0.5 px-1 font-mono text-xs text-muted opacity-0 transition-opacity hover:text-rust focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>

                  {doc.error && (
                    <p className="mt-1 text-xs leading-snug text-rust">{doc.error}</p>
                  )}

                  {/* Documents indexed before summaries existed can get one on demand. */}
                  {doc.status === "ready" && !doc.summary && (
                    <button
                      type="button"
                      onClick={() => void summarise(doc.id)}
                      disabled={summarising === doc.id}
                      className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:text-cyan disabled:cursor-wait"
                    >
                      {summarising === doc.id ? "Summarising…" : "+ Summarise"}
                    </button>
                  )}

                  {isOpen && doc.summary && (
                    <div className="rise mt-2 border-l-2 border-amber/60 bg-panel px-3 py-2">
                      <p className="font-reading text-sm leading-relaxed text-parchment/80">
                        {doc.summary}
                      </p>

                      {doc.key_points?.length > 0 && (
                        <ul className="mt-2.5 flex flex-col gap-1.5">
                          {doc.key_points.map((point, i) => (
                            <li key={i} className="flex gap-2 text-xs leading-relaxed text-parchment/75">
                              <span className="mt-[3px] font-mono text-[9px] text-cyan">▪</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {doc.key_topics?.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1">
                          {doc.key_topics.map((topic) => (
                            <li
                              key={topic}
                              className="border border-rule px-1.5 py-0.5 font-mono text-[10px] text-muted"
                            >
                              {topic}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AccountBar />
    </aside>
  );
}
