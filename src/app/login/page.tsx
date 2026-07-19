"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

/** Open eye, or eye with a slash through it when the password is visible. */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3.2" />
      {open && <line x1="3.5" y1="20.5" x2="20.5" y2="3.5" />}
    </svg>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSignup ? { email, name, password } : { email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      // Full navigation, not a client push: the proxy needs to see the new
      // cookie before it decides where this request is allowed to go.
      window.location.href = params.get("next") ?? "/";
    } catch {
      setError("Couldn't reach the server. Check that it's still running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ground flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="eyebrow">Knowledge Hub</p>
        <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-parchment">
          {isSignup ? "Create your account" : "Sign in"}
        </h1>
        <p className="mt-3 font-reading text-muted">
          {isSignup
            ? "Your documents, guides and conversations stay in your own workspace."
            : "Pick up where you left off."}
        </p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          {isSignup && (
            <div>
              <label htmlFor="name" className="eyebrow">
                Name
              </label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
                className="mt-2 w-full border border-rule bg-ink px-3 py-2 text-sm text-parchment placeholder:text-muted/70 focus:border-cyan focus:outline-none"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="eyebrow">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-2 w-full border border-rule bg-ink px-3 py-2 text-sm text-parchment placeholder:text-muted/70 focus:border-cyan focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="eyebrow">
              Password
            </label>
            <div className="relative mt-2">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={isSignup ? 8 : undefined}
                autoComplete={isSignup ? "new-password" : "current-password"}
                className="w-full border border-rule bg-ink py-2 pl-3 pr-11 text-sm text-parchment placeholder:text-muted/70 focus:border-cyan focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                // Labelled rather than icon-only, and announced as a toggle, so
                // it's usable without seeing the eye.
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-cyan"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {isSignup && (
              <p className="mt-1.5 text-xs text-muted">At least 8 characters.</p>
            )}
          </div>

          {error && (
            <p role="alert" className="border-l-2 border-rust bg-rust/10 px-3 py-2 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="border border-cyan py-2.5 font-mono text-xs uppercase tracking-widest text-cyan transition-colors hover:bg-cyan hover:text-ink disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Working…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          {isSignup ? "Already have an account?" : "No account yet?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? "login" : "signup");
              setError(null);
            }}
            className="text-cyan underline underline-offset-4 hover:text-parchment"
          >
            {isSignup ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
