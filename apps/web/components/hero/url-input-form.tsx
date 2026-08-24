"use client";

import { useRef } from "react";
import { Link2, X, Loader2 } from "lucide-react";

export function UrlInputForm({
  url,
  onUrlChange,
  onSubmit,
  disabled,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onUrlChange(text.trim());
      inputRef.current?.focus();
    } catch {
      // Clipboard permission denied — just focus the field so the
      // person can paste manually with Cmd/Ctrl+V.
      inputRef.current?.focus();
    }
  }

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && url.trim()) onSubmit();
      }}
    >
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors focus-within:border-amber/50 sm:rounded-2xl sm:px-5 sm:py-4">
        <Link2 className="hidden h-5 w-5 flex-none text-ink-muted sm:block" strokeWidth={1.5} />

        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Video URL"
          placeholder="Paste video URL here..."
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none disabled:opacity-50 sm:text-base"
        />

        {url ? (
          <button
            type="button"
            onClick={() => onUrlChange("")}
            aria-label="Clear URL"
            className="flex-none rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePaste}
            className="flex-none rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            Paste
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={disabled || !url.trim()}
        className="group mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber py-3.5 font-display text-sm font-medium tracking-tight text-void transition-all hover:bg-amber-bright disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-muted sm:mx-auto sm:w-auto sm:px-10"
      >
        {disabled && <Loader2 className="h-4 w-4 animate-spin" />}
        {disabled ? "Analyzing…" : "Analyze video"}
      </button>
    </form>
  );
}
