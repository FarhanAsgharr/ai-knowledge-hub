"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders the generated guide. Styling lives in globals.css under `.guide` so the
 * markdown stays plain rather than every element needing a component override.
 */
export function GuideView({ markdown }: { markdown: string }) {
  return (
    <div className="guide">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Wide comparison tables scroll on their own instead of forcing the
          // whole page sideways on a phone.
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
