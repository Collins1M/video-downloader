"use client";

import { useState } from "react";
import { saveAdminCredentials, verifyAdminCredentials } from "@/lib/admin-api";

export function AdminLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyAdminCredentials(username, password);
      saveAdminCredentials(username, password);
      onSuccess();
    } catch {
      setError("Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">Admin</p>
      <h1 className="mt-2 font-display text-2xl font-medium tracking-tight">Sign in</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-ink-muted">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm focus:border-amber/50 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-ink-muted">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm focus:border-amber/50 focus:outline-none"
          />
        </div>

        {error && <p className="font-mono text-xs text-amber">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-amber py-2.5 font-display text-sm font-medium text-void transition-colors hover:bg-amber-bright disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
