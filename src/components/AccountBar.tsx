"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Me = { id: string; name: string; email: string; role: "user" | "admin" };

export function AccountBar() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/auth/me");
      const data = await response.json();
      if (!cancelled) setMe(data.user);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!me) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-rule px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-parchment/90" title={me.email}>
          {me.name}
        </p>
        <p className="font-mono text-[11px] text-muted">
          {me.role === "admin" ? <span className="text-amber">admin</span> : "member"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {me.role === "admin" && (
          <Link
            href="/admin"
            className="border border-rule px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:border-amber hover:text-amber"
          >
            Admin
          </Link>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="border border-rule px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:border-rust hover:text-rust"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
