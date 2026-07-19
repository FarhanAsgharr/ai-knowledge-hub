"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MODES = [
  { href: "/", label: "Ask", hint: "Answer from my documents" },
  { href: "/learn", label: "Learn", hint: "Build a study guide" },
];

export function ModeNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1" aria-label="Mode">
      {MODES.map((mode) => {
        const active = pathname === mode.href;
        return (
          <Link
            key={mode.href}
            href={mode.href}
            title={mode.hint}
            aria-current={active ? "page" : undefined}
            className={`border px-3 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
              active
                ? "border-cyan text-cyan"
                : "border-rule text-muted hover:border-muted hover:text-parchment"
            }`}
          >
            {mode.label}
          </Link>
        );
      })}
    </nav>
  );
}
