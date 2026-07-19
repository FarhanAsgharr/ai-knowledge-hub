"use client";

import { useState } from "react";

import type { Citation } from "@/lib/types";

/**
 * The signature element: every answer exposes the passages it was built from,
 * each with the cosine similarity that got it retrieved. The bar is the score,
 * not decoration.
 */
export function SourceStrip({ citations }: { citations: Citation[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (citations.length === 0) return null;

  // Document-level sources carry no similarity: they come from a stored summary
  // rather than a vector match, so the strip is labelled differently.
  const fromSummaries = citations.every((citation) => citation.similarity === undefined);

  return (
    <div className="rise mt-4 border-t border-rule pt-3">
      <p className="eyebrow mb-2">
        {fromSummaries
          ? `Answered from ${citations.length} document ${citations.length === 1 ? "summary" : "summaries"}`
          : `Retrieved ${citations.length} ${citations.length === 1 ? "passage" : "passages"}`}
      </p>

      <ul className="flex flex-col gap-1">
        {citations.map((citation, index) => {
          const isOpen = openId === citation.chunkId;
          const percent =
            citation.similarity === undefined
              ? null
              : Math.round(citation.similarity * 100);

          return (
            <li key={citation.chunkId}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : citation.chunkId)}
                aria-expanded={isOpen}
                className="group flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-raised"
              >
                <span className="font-mono text-xs text-cyan tabular-nums">
                  [{index + 1}]
                </span>

                <span className="min-w-0 flex-1 truncate text-sm text-parchment/85">
                  {citation.filename}
                  {citation.page !== null && (
                    <span className="font-mono text-xs text-muted"> · p{citation.page}</span>
                  )}
                </span>

                {/* Similarity, read as an instrument: bar plus exact value.
                    A summary source shows a label instead — there's no score. */}
                {percent === null ? (
                  <span className="font-mono text-[11px] uppercase tracking-widest text-amber">
                    summary
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-2"
                    title={`Cosine similarity ${percent}%`}
                  >
                    <span className="hidden h-[3px] w-16 bg-rule sm:block">
                      <span
                        className="block h-full bg-cyan"
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </span>
                    <span className="font-mono text-xs text-muted tabular-nums">{percent}</span>
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="rise mx-2 mb-2 max-h-64 overflow-y-auto border-l-2 border-amber/60 bg-panel px-3 py-2">
                  <p className="font-reading text-sm leading-relaxed text-parchment/75">
                    {citation.text}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
