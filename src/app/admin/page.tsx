"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Totals = {
  users: number;
  workspaces: number;
  documents: number;
  chunks: number;
  conversations: number;
  messages: number;
  guides: number;
  bytes_stored: string;
  active_sessions: number;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  created_at: string;
  documents: number;
  guides: number;
  conversations: number;
  bytes_stored: string;
};

type Activity = { kind: string; label: string; created_at: string };
type Failure = { filename: string; error: string; created_at: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const KIND_COLOURS: Record<string, string> = {
  document: "text-amber",
  guide: "text-cyan",
  conversation: "text-muted",
};

export default function AdminPage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [recent, setRecent] = useState<Activity[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/admin/stats");
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error ?? "Couldn't load the dashboard.");
        return;
      }
      setTotals(data.totals);
      setUsers(data.users);
      setRecent(data.recent);
      setFailures(data.failures);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="ground flex min-h-full items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="eyebrow">Admin</p>
          <p className="mt-3 font-reading text-lg text-parchment">{error}</p>
          <Link
            href="/"
            className="mt-6 inline-block border border-rule px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted hover:border-cyan hover:text-cyan"
          >
            Back to the app
          </Link>
        </div>
      </main>
    );
  }

  const tiles = totals
    ? [
        { label: "Accounts", value: totals.users },
        { label: "Documents", value: totals.documents },
        { label: "Indexed chunks", value: totals.chunks },
        { label: "Study guides", value: totals.guides },
        { label: "Conversations", value: totals.conversations },
        { label: "Messages", value: totals.messages },
        { label: "Stored", value: formatBytes(Number(totals.bytes_stored)) },
        { label: "Active sessions", value: totals.active_sessions },
      ]
    : [];

  return (
    <main className="ground min-h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="mt-2 font-display text-3xl tracking-tight text-parchment">
              Instance overview
            </h1>
          </div>
          <Link
            href="/"
            className="border border-rule px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:border-cyan hover:text-cyan"
          >
            Back to app
          </Link>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="bg-panel px-4 py-5">
              <p className="font-mono text-2xl tabular-nums text-parchment">{tile.value}</p>
              <p className="eyebrow mt-1">{tile.label}</p>
            </div>
          ))}
          {!totals &&
            Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="bg-panel px-4 py-5">
                <p className="font-mono text-2xl text-muted">—</p>
              </div>
            ))}
        </section>

        <h2 className="mt-12 font-display text-xl text-parchment">Accounts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="eyebrow py-2 pr-4">Name</th>
                <th className="eyebrow py-2 pr-4">Email</th>
                <th className="eyebrow py-2 pr-4">Role</th>
                <th className="eyebrow py-2 pr-4 text-right">Docs</th>
                <th className="eyebrow py-2 pr-4 text-right">Guides</th>
                <th className="eyebrow py-2 pr-4 text-right">Chats</th>
                <th className="eyebrow py-2 text-right">Stored</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-rule/50">
                  <td className="py-2.5 pr-4 text-parchment/90">{user.name}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-muted">{user.email}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`font-mono text-xs ${
                        user.role === "admin" ? "text-amber" : "text-muted"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-parchment/80">
                    {user.documents}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-parchment/80">
                    {user.guides}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-parchment/80">
                    {user.conversations}
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs tabular-nums text-muted">
                    {formatBytes(Number(user.bytes_stored))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {failures.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-xl text-rust">Failed ingestions</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {failures.map((failure, i) => (
                <li key={i} className="border-l-2 border-rust bg-rust/5 px-3 py-2">
                  <p className="text-sm text-parchment/90">{failure.filename}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">{failure.error}</p>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="mt-12 font-display text-xl text-parchment">Recent activity</h2>
        <ul className="mt-4 flex flex-col">
          {recent.map((item, i) => (
            <li
              key={i}
              className="flex items-baseline gap-3 border-b border-rule/50 py-2.5 last:border-0"
            >
              <span className={`font-mono text-[11px] uppercase ${KIND_COLOURS[item.kind]}`}>
                {item.kind}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-parchment/85">
                {item.label}
              </span>
              <span className="font-mono text-[11px] text-muted">
                {new Date(item.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
