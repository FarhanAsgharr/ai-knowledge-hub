"use client";

import { useCallback, useEffect, useState } from "react";

import { Chat } from "@/components/Chat";
import { Library } from "@/components/Library";
import type { DocumentRow } from "@/lib/types";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/documents");
      const data = await response.json();
      setDocuments(data.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="flex h-full flex-col lg:flex-row">
      <Library
        documents={documents}
        loading={loading}
        onUploaded={refresh}
        onDeleted={refresh}
      />
      <Chat documents={documents} />
    </main>
  );
}
